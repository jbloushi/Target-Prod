# LogesTechs Carrier Adapter

This document describes the `OTE` carrier adapter (implemented on top of LogesTechs APIs) under `backend/src/adapters/LogesTechsAdapter.js`.

## Environment Variables

Set these in `backend/.env` (server-side only):

```env
LOGESTECHS_SHIPMENT_BASE_URL=https://apisv2.logestechs.com/api
LOGESTECHS_FULFILLMENT_BASE_URL=https://apisv5.logestechs.com/api
LOGESTECHS_COMPANY_ID=
LOGESTECHS_USERNAME=
LOGESTECHS_PASSWORD=
LOGESTECHS_EMAIL=
LOGESTECHS_SHIPMENT_EMAIL=
LOGESTECHS_SHIPMENT_PASSWORD=
```

> Never expose these values to frontend bundles. They are read only by backend runtime config.
>
> Required credentials are: `LOGESTECHS_COMPANY_ID`, `LOGESTECHS_USERNAME`, `LOGESTECHS_PASSWORD`.
> `LOGESTECHS_EMAIL`, `LOGESTECHS_SHIPMENT_EMAIL`, and `LOGESTECHS_SHIPMENT_PASSWORD` are optional overrides.

## Supported Methods / Endpoints

### Shipment API (v2 base URL)

- `createShipment()` -> `POST /ship/request/by-email`
- `getVillages(search)` -> `GET /addresses/villages?search=`
- `getLabel(ids)` -> `POST /guests/{companyId}/packages/pdf`
- `cancelShipment(shipmentId)` -> `PUT /guests/{companyId}/packages/{shipmentId}/cancel`
- `getStatus({ barcode, id })` -> `GET /guests/packages/status?barcode=` or `?id=`

### Fulfillment API (v5 base URL)

- `addOrUpdateProducts(products)` -> `POST /public/fulfillment/product/bulk`
- `getProducts({ page, pageSize })` -> `GET /public/fulfillment/product`
- `getProductCategories({ page, pageSize, search })` -> `GET /public/fulfillment/product/category`
- `addFulfillmentOrder(orderPayload)` -> `POST /public/fulfillment/order`
- `getFulfillmentOrders({ page, pageSize })` -> `GET /public/fulfillment/order`

## Mapping and Validation Notes

- Shipment payload uses `pkgUnitType: METRIC`.
- Shipment `pkg` now includes compatibility fields used by OTE create endpoint (`quantity`, sender/receiver names and phones, `serviceType`, `shipmentType`, `invoiceNumber`, and optional notes) when available.
- Adapter sends `shipmentType`/`serviceType` defaults (`REGULAR`/`STANDARD`) at top-level, inside `pkg`, and inside a compatibility `model` object because some OTE validations check `model.shipmentType` even when other fields are present.
- Adapter now centralizes OTE create payload normalization in dedicated helper methods (`_normalizeCarrierModelFields`, `_buildCreateShipmentPayload`) to keep carrier-specific payload rules explicit and maintainable.
- Adapter emits a sanitized `createShipment payload summary` log (shipment/service type locations and key flags) to diagnose provider-side `model.shipmentType` validation failures without exposing credentials.
- Placeholder string values like `"null"` / `"undefined"` are treated as missing and replaced by defaults to avoid provider `model.shipmentType null` validation failures.
- Internal shipment/service values are normalized to OTE-safe enums before request send (unsupported values fall back to `REGULAR` / `STANDARD`) to prevent provider enum coercion to null.
- Duplicate-shipment provider responses (e.g., Arabic `رقم الارسالية ... موجود مسبقا`) are tagged as `DUPLICATE_SHIPMENT` so booking flow can recover existing shipment status/label instead of hard-failing approval.
- Booking persistence now supports `labelUrl`, `invoiceUrl`, and `awbUrl` when available from provider responses or recovery calls.
- Shipment `email` is resolved as `LOGESTECHS_SHIPMENT_EMAIL` -> `LOGESTECHS_USERNAME` -> `LOGESTECHS_EMAIL`.
- Shipment `password` is resolved as `LOGESTECHS_SHIPMENT_PASSWORD` -> `LOGESTECHS_PASSWORD`.
- `destinationAddress` and `originAddress` are mapped in best-effort mode from internal shipment fields.
- When IDs are missing, adapter attempts village lookup (`/addresses/villages?search=`) using textual address hints to auto-fill `villageId/cityId/regionId` before shipment create.
- Village lookup requests use `company-id` header as in provider examples.
- Status lookup requires either `barcode` or `id`.
- Tracking normalization supports both provider `events` arrays and `deliveryRoute` responses, so shipment history sync can consume OTE status timelines.
- Label PDF retrieval requires non-empty `ids` array.
- Adapter preserves UTF-8 business/address strings (Arabic text is forwarded without transliteration).
- Carrier code is `OTE` (legacy `LOGESTECHS` values are treated as backward-compatible aliases).
- Returned shipment object stores `carrierShipmentId` and `barcode`/`trackingNumber` when available.
- If provider returns invalid login credentials (including Arabic auth errors), adapter returns actionable guidance to verify shipment credentials (`LOGESTECHS_SHIPMENT_EMAIL`/`LOGESTECHS_SHIPMENT_PASSWORD` or fallback values), plus `LOGESTECHS_USERNAME` and `LOGESTECHS_COMPANY_ID`.
- If provider responds with generic `Unknown error`, adapter now appends HTTP status and sanitized payload context to make debugging production failures actionable.
- Fulfillment product bulk requests are sent in `{ list: [...] }` shape per provider collection.
- Fulfillment order requests are normalized to provider fields (`receiverName`, `receiverPhone`, `receiverAddress`, `shipmentType`, `codCollectionMethod`, `cod`, `cost`, `items`, `invoiceNumber`) with safe defaults for omitted optional values.
- Manual `price`/`costPrice` override for existing OTE shipments is allowed only for platform roles (`admin`, `staff`, `manager`, `accounting`); client users cannot override these fields.

## Sample cURL

### Create shipment (v2)

```bash
curl -X POST "https://apisv2.logestechs.com/api/ship/request/by-email" \
  -H "Content-Type: application/json" \
  -H "company-id: $LOGESTECHS_COMPANY_ID" \
  -H "username: $LOGESTECHS_USERNAME" \
  -H "password: $LOGESTECHS_PASSWORD" \
  -d '{
    "email": "'$LOGESTECHS_EMAIL'",
    "password": "'$LOGESTECHS_PASSWORD'",
    "pkgUnitType": "METRIC",
    "pkg": {
      "piecesCount": 1,
      "weight": 2,
      "length": 20,
      "width": 20,
      "height": 20,
      "description": "وثائق / Documents"
    },
    "destinationAddress": {
      "addressLine1": "شارع سالم المبارك",
      "cityId": "CITY_ID",
      "regionId": "REGION_ID",
      "villageId": "VILLAGE_ID"
    },
    "originAddress": {
      "addressLine1": "Qibla Block 3",
      "cityId": "CITY_ID",
      "regionId": "REGION_ID",
      "villageId": "VILLAGE_ID"
    }
  }'
```

## Limitations / Assumptions

- `getRates()` returns an empty list because no LogesTechs rate endpoint was provided in the integration brief.
- TODO: Confirm exact shipment creation response schema from LogesTechs docs to finalize `shipmentId`/`barcode` field extraction paths.
- TODO: Confirm canonical fulfillment product/order request body schemas for stricter DTO validation.
- TODO: Confirm whether OTE/LogesTechs requires strict location IDs for all tenants; local adapter currently sends IDs when present and otherwise forwards textual addresses.
