# Carrier Adapter Onboarding Guide

This guide explains how to add a new carrier adapter (for example UPS/FedEx) so it is:

1. Usable for shipment rating/booking flows.
2. Visible in user shipping-access assignment inside Admin Users.

---

## 1) Add or wire the adapter implementation

- Create a new adapter in `backend/src/adapters/` implementing the same public methods used by the booking/rating flows (`getRates`, `createShipment`, `getTracking` where relevant).
- Follow the structure used by `DgrAdapter` and `AramexAdapter`.

## 2) Register the carrier in `CarrierFactory`

Update `backend/src/services/CarrierFactory.js`:

- Add the carrier to `getAvailableCarriers()` with:
  - `code` (e.g. `UPS`)
  - `name`
  - `active` (`false` until production-ready)
  - `trackingPrefix`
  - `defaultServiceCode`
  - `capabilities`
- Add a `getAdapter` switch case for the new carrier.

Carrier capabilities should describe whether the carrier uses external APIs:

```js
{
  supportsBooking: true,
  supportsRating: true,
  supportsTracking: true,
  supportsCancellation: false,
  supportsLabelGeneration: true,
  supportsExternalApi: true
}
```

For local-only carriers such as `INTERNAL`, set `supportsExternalApi: false` and keep all booking/tracking behavior inside the adapter.

`getAvailableCarriers()` is the single source used for:

- Shipment wizard carrier lists.
- Admin user shipping-access assignment list (`scope=assignment`).

## 3) Add service labels and service options

Update `backend/src/services/shippingAccess.service.js`:

- Add service codes under `SERVICE_LABELS.<CARRIER_CODE>`.
- Ensure `getServiceOptions(carrierCode)` returns meaningful choices.

These labels are used in assignment and enforcement messages.

## 4) Ensure admin assignment visibility

Admin user management fetches carriers from:

- `GET /api/shipments/carriers?scope=assignment`

For platform roles, `scope=assignment` returns the full carrier catalog from `CarrierFactory` (active and inactive), including service options, so admins can assign users consistently.

## 5) Frontend carrier profile (wizard UX)

If the new carrier needs custom behavior (dangerous goods, packaging options, required fields), add/update the profile mapping in:

- `frontend/src/pages/ShipmentWizardV2.jsx` (`CARRIER_PROFILES`)

At minimum, ensure the new carrier has sane defaults.

## 6) Policy behavior (Option A)

The system uses single-assignment shipping access for client users:

- One assigned carrier/service or the internal carrier.
- New internal assignments should use `INTERNAL / STD`.

When an admin saves a user:

- `agentPolicy.shippingAccess` is normalized.
- `agentPolicy.allowedCarriers` is set to the assigned carrier only.

This keeps assignment enforcement deterministic across shipment creation and API calls.

## 7) Recommended rollout checklist

1. Add adapter + factory registration.
2. Add service labels.
3. Keep carrier `active: false` initially.
4. Test carrier appears in Admin Users assignment.
5. Test user assignment save/update and enforcement.
6. Enable `active: true` when operationally ready.
7. Update `docs/PLATFORM_FEATURES.md` carrier table/status.

