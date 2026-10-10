# Target Logistics Glossary

Terms below describe the business domain. Implementation names and carrier API details belong in the relevant module documentation, not here.

## Shipment

The operational logistics record managed by Target Logistics from creation through pickup, movement, delivery, return, cancellation, or exception handling.

## Order

The originating commercial or commerce transaction that may create one or more shipments. An order is not interchangeable with a shipment.

## Tracking number / AWB

The identifier used to locate and track a shipment. Depending on the carrier, this may be called an airway bill (AWB), tracking number, or another carrier reference.

## Label / waybill

A shipment document used for identification, handling, and carrier processing. A label or waybill is a document belonging to a shipment, not the shipment itself.

## Carrier

The logistics provider or Target-operated shipping path responsible for transporting or managing a shipment. Carrier names shown to users should be clear and customer-friendly.

## DHL Express

A user-facing carrier name for a DHL-backed shipping path. Target may operate more than one DHL account or adapter path, including a distinct DHL DGR path.

## DHL DGR

A distinct Target shipping path for DHL Express associated with the DGR account or adapter configuration. It may appear separately from another DHL account when account-specific services, rates, credentials, or operational rules differ.

## Carrier path

A specific carrier-account route used by Target for rating, booking, documents, or tracking. Two paths for the same carrier brand remain distinct when they use different accounts, credentials, services, rates, or operational rules.

## Manual Shipment

A shipment managed inside Target Logistics without external carrier booking. It is a normal operational shipment path, not an error or fallback state.

## Local shipment draft

A shipment created inside Target Logistics before external carrier booking. A local draft may later be assigned to, re-rated for, and booked with a supported carrier path. A local draft is not automatically a Manual Shipment.

## Manual Shipment path

The intentional internal-carrier path for shipments that remain inside Target Logistics and are not submitted to an external carrier.

## Selling shipping price

The price presented to the client or customer for shipping. It is derived from the selected carrier rate together with Target’s markup or rate-card rules and is captured for the shipment when the commercial decision is made.

## Current rate

The latest carrier rate and Target selling-price calculation available for the shipment’s current verified data and selected carrier path. Clients see the current rate; a prior displayed rate is not treated as a permanent booking promise.

## Verified shipment pricing

The carrier rate and selling price recalculated after Target staff verifies the shipment’s actual dimensions, weight, and required commercial information. Price changes are recorded internally before carrier booking; client approval is not required.

## Carrier booking

The staff-controlled operation that creates or confirms the shipment with the selected external carrier and obtains the carrier’s tracking reference and available documents.

## Client-submitted shipment

A shipment created by a client through the Client API and handed to Target staff for operational review. Staff verifies dimensions and weight, completes required shipment information, reviews the commercial details, and then books the shipment with the assigned carrier path.

## Operational review gate

The required staff checkpoint between client submission and external carrier booking. The gate confirms shipment data, dimensions, weight, pricing, required customs information, and carrier readiness before booking.

## Ready for Pickup

The shipment has been submitted by the client and is ready for Target’s driver or pickup operation. It has not necessarily been created with or booked by the external carrier yet.

## Driver Pickup

The physical handoff in which a Target driver collects the shipment from the client and records the pickup operation.

## Received at Office

The shipment has arrived at Target’s office or hub after driver pickup and is available for staff verification, completion, review, and external carrier booking. Operational review is part of this phase, not a separate persisted shipment state.

## Carrier-created shipment

A shipment that has already been created or booked with an external carrier. Its carrier identity and carrier-specific booking cannot be changed; a different carrier requires a separate controlled process rather than editing the existing carrier assignment.

## Tracking-only carrier path

A carrier path that can retrieve carrier-supplied shipment tracking history but cannot be used by Target to rate or book shipments. Current FedEx and Aramex paths are tracking-only until official booking adapters are implemented and verified. Target does not create manually-authored tracking events for these paths.

## Exception

An operational condition requiring attention, such as delay, failed delivery, damage, or clearance trouble. An exception is an operational flag and does not necessarily terminate the shipment’s underlying lifecycle.

## Client API key

An integration credential belonging to one client user. It inherits that user’s organization and shipping access and must not grant broader access than the user already has.

## Carrier-specific label

A shipment document whose format, fields, barcode, and issuance rules are determined by the selected carrier path. A Target shipment may therefore have different label documents depending on whether it is booked through DHL, DHL DGR, another carrier, or the internal path.

## Official tracking integration

A supported carrier or tracking-provider API used to retrieve tracking history and events. Official integrations are the target state for FedEx and Aramex; web scrapers are temporary migration mechanisms and are not the long-term carrier contract.

## Audited commercial change

A change to carrier, rate, markup, selling price, or other commercial shipment data that preserves the previous value, the new value, the actor, the timestamp, and the reason or supporting action.
