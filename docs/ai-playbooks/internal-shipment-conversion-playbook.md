# Internal Shipment Conversion Playbook

Use this playbook when building, debugging, or extending conversion from `INTERNAL` shipments to external carrier shipments.

## Core Invariants

- `INTERNAL` is the only manual/internal carrier concept.
- Conversion creates a new shipment; it does not mutate the original `INTERNAL` shipment into `DGR` or `OTE`.
- Carrier eligibility comes from registry/capability metadata.
- Conversion itself does not call external carrier booking APIs.
- External booking still goes through `ShipmentBookingService`.
- Finance ledger debits are not posted by conversion alone.
- Both source and target shipments must receive history events.

## Main Files

| Area | File |
| --- | --- |
| Carrier registry | `backend/src/services/CarrierFactory.js` |
| Internal adapter | `backend/src/adapters/InternalAdapter.js` |
| Booking flow | `backend/src/services/ShipmentBookingService.js` |
| Draft/rating flow | `backend/src/services/ShipmentDraftService.js` |
| Shipment routes | `backend/src/routes/shipment.routes.js` |
| Shipment controllers | `backend/src/controllers/shipment-booking.controller.js`, `backend/src/controllers/shipment-crud.controller.js` |
| Frontend API client | `frontend/src/services/api.jsx` |
| Shipment details UI | `frontend/src/pages/ShipmentDetailsPage.jsx` |
| Finance reference | `docs/modules/accounting-finance.md` |
| Carrier reference | `docs/modules/carriers.md` |
| Shipment reference | `docs/modules/shipments.md` |

## Backend Checklist

1. Add or update tests before production code.
2. Assert carrier registry includes conversion capability metadata.
3. Assert `INTERNAL` to `DGR` or `OTE` creates a new shipment with a non-`TGR` tracking number.
4. Assert source shipment history includes conversion details.
5. Assert target shipment history references the source `TGR` tracking number.
6. Assert conversion does not call `adapter.createShipment()` unless an explicit future `bookImmediately` path is implemented.
7. Assert non-internal source shipments are rejected.
8. Assert unsupported target carriers are rejected.
9. Assert finance ledger rows are not created by conversion alone.

## Frontend Checklist

1. Show conversion controls only for `INTERNAL` shipments and authorized platform roles.
2. Exclude `INTERNAL` and non-conversion-enabled carriers from the conversion target list.
3. Show target-carrier rating/booking options before conversion when available.
4. If pricing is unavailable, display the existing manual pricing language instead of breaking the quote flow.
5. After conversion succeeds, show or navigate to the new carrier-backed shipment.
6. Keep the original `TGR` shipment accessible for audit and tracking history.

## Debugging Symptoms

| Symptom | Check |
| --- | --- |
| Internal shipment still appears active after conversion | Source status update and conversion metadata write |
| New shipment has `carrierCode: INTERNAL` | Conversion service copied carrier fields instead of setting target carrier |
| Booking a converted shipment calls the internal adapter | New shipment `carrierCode` or `serviceCode` is wrong |
| DGR/OTE booking is blocked by carrier assignment | Access policy or assigned carrier enforcement in `ShipmentBookingService` |
| Duplicate invoice line risk | Whether a ledger entry already exists for the source shipment |
| Conversion list shows future carriers | Carrier capability metadata and frontend filtering |

## Test Commands

Run the focused backend tests first, then the full verification:

```powershell
npm run test
npm run build
```

For local E2E, start the app and create an `INTERNAL` shipment, then convert it to `DGR` or `OTE` from the shipment details page.

