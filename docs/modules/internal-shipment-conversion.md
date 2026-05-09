# Internal Shipment Conversion

Internal shipments use carrier code `INTERNAL` and tracking prefix `TGR`. They represent shipments that start under Target Logistics operations without an external carrier booking. When operations later decides the shipment should move through DGR or OTE, the platform converts the internal shipment by creating a new carrier-backed shipment instead of mutating the original record in place.

## Why Conversion Creates A New Shipment

The internal shipment already has its own platform tracking number, operational history, pricing state, and public tracking URL. External carriers also generate or require their own booking identifiers, labels, and billing events. Replacing the original carrier fields would blur those audit trails.

The conversion workflow preserves both records:

| Record | Purpose |
| --- | --- |
| Original `INTERNAL` shipment | Audit trail for manual handling before the carrier handoff |
| New external shipment | The active carrier-booked shipment that can be rated, booked, tracked, billed, and invoiced |

The original internal shipment is closed with a conversion history event. The new external shipment receives a reciprocal history event linking it back to the original `TGR` tracking number.

## Supported Conversion Targets

Conversion targets must be declared in carrier capability metadata. Do not hardcode a special case in controllers or frontend components.

Current intended conversion targets:

| Carrier | Code | Conversion Target |
| --- | --- | --- |
| DHL DGR | `DGR` | Yes |
| OTE / LogesTechs | `OTE` | Yes |
| Internal | `INTERNAL` | No |
| Aramex, FedEx, UPS | `ARAMEX`, `FEDEX`, `UPS` | No, until enabled and tested |

Future carriers should become conversion targets only after they support the normal adapter flow for rating or booking and have operational approval.

## Workflow

1. Staff opens an `INTERNAL` shipment.
2. Staff chooses a conversion target carrier from eligible carriers.
3. The platform requests rates or booking options through the target carrier adapter.
4. Staff selects the service.
5. The platform creates a new shipment with:
   - a new unique tracking number for the target carrier
   - copied sender, receiver, parcels, items, shipment type, organization, and creator context
   - selected `carrierCode` and `serviceCode`
   - pricing snapshot from the selected target-carrier rate
   - history event: `Created from internal shipment TGR...`
6. The original `INTERNAL` shipment is marked converted/closed and receives:
   - history event: `Converted to DGR shipment ...` or `Converted to OTE shipment ...`
   - conversion metadata in `pricingSnapshot.conversion`
7. External booking continues through the normal booking flow for the new shipment.

The conversion step itself must not bypass the carrier adapter architecture. If a carrier is booked immediately in a future version, it should still go through `ShipmentBookingService`.

## Status And Finance Rules

The original internal shipment should not create a second billable operational shipment after conversion. It remains visible for audit/history, but the new external shipment becomes the active shipment for booking, customer billing, accounting summaries, invoices, and reporting.

Finance expectations:

- Do not assume an external carrier cost exists on the internal shipment.
- Do not post a shipment-charge ledger entry during conversion by itself.
- Customer billing should use the new carrier-backed shipment after conversion.
- If the internal shipment already has a manual price, keep it on the original record as audit data. Do not silently copy it to the new shipment unless a future manual override workflow explicitly asks for that behavior.
- If a ledger entry was already posted for the internal shipment, conversion must either block or require an explicit finance reversal workflow.

## Access Rules

Conversion is an operational action. It should require the same high-trust role family used for booking carriers and shipment operations, plus normal shipment visibility checks:

- `admin`
- `manager`
- `staff`
- `accounting`

Client roles should not convert shipments between carriers.

## Failure Cases

The conversion endpoint should reject:

- source shipment not found
- source shipment is not `INTERNAL`
- source shipment is already converted
- source shipment is delivered or cancelled
- target carrier is not conversion-enabled
- selected service does not exist in the target carrier rate results
- conversion would duplicate a billable ledger entry without a reversal path

## Public Tracking

Both tracking URLs remain valid. The internal `TGR` tracking page should show the conversion event and the new carrier tracking number. The new shipment page should show that it was created from the original internal shipment.

