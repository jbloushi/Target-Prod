# LogesTechs Carrier Adapter

This document describes the `LOGESTECHS` carrier/provider adapter added under `backend/src/adapters/LogesTechsAdapter.js`.

## Environment Variables

Set these in `backend/.env` (server-side only):

```env
LOGESTECHS_SHIPMENT_BASE_URL=https://apisv2.logestechs.com/api
LOGESTECHS_FULFILLMENT_BASE_URL=https://apisv5.logestechs.com/api
LOGESTECHS_COMPANY_ID=
LOGESTECHS_USERNAME=
LOGESTECHS_PASSWORD=
LOGESTECHS_EMAIL=
```

> Never expose these values to frontend bundles. They are read only by backend runtime config.

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
- `destinationAddress` and `originAddress` require: `regionId`, `cityId`, and `villageId`.
- Status lookup requires either `barcode` or `id`.
- Label PDF retrieval requires non-empty `ids` array.
- Adapter preserves UTF-8 business/address strings (Arabic text is forwarded without transliteration).
- Returned shipment object stores `carrierShipmentId` and `barcode`/`trackingNumber` when available.

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
