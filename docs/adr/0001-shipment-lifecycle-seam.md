---
status: accepted
---

# Centralize shipment lifecycle changes behind one module

Target Logistics will introduce one shipment lifecycle module as the internal seam for client submission, driver pickup, office receipt, operational review, pricing refresh, carrier booking, carrier-event ingestion, recovery, and shipment history writes. Existing draft, pricing, booking, carrier, and normalization implementations remain internal collaborators and are migrated incrementally behind named operations. The first implementation must preserve production behavior, keep existing records and documents accessible, retain the current external Client API contract, prevent duplicate carrier bookings through reconciliation/idempotency, and use both deterministic lifecycle tests and the existing DGR DHL test account for integration verification.

## Consequences

- Controllers translate transport concerns and normalized commands; they do not own lifecycle rules.
- Carrier events enter through the lifecycle seam while retaining internal provider provenance and exposing normalized client/public views.
- Local database changes are transactional; external carrier calls use persisted attempts and reconciliation rather than pretending to be part of a database transaction.
- Migration is behavior-preserving and incremental; intentional behavior changes require separate work items.
