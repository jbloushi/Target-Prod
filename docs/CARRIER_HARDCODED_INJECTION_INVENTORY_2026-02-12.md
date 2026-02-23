# Carrier API Hardcoded Injection Inventory (DGR/DHL path)

This is a **complete inventory (current code)** of hardcoded values/text that can be injected into carrier request payloads or quote responses used by shipment creation.

## A) `backend/src/services/dgr-payload-builder.js`

| # | Location | Hardcoded value / behavior | Injected into carrier payload? | Notes |
|---|---|---|---|---|
| 1 | `composeItemDescription()` | Appends `", Perfumery products containing alcohol, UN1266, Class 3"` for DG code `1266`. | Yes | Auto-modifies line-item description. |
| 2 | `composeItemDescription()` | Appends `", Device with lithium-ion battery contained in equipment (UN3481)"` for DG code `3481`. | Yes | Auto-modifies line-item description. |
| 3 | `composeItemDescription()` | Appends `", Packed with Dry Ice UN1845, ${dangerousGoods.dryIceWeight || 0}kg"` for DG code `1845`. | Yes | Uses fallback `0kg` if dry ice weight missing at this point. |
| 4 | `composeItemDescription()` | Fallback description `'Item'` when item description missing. | Yes | In practice validation requires description; fallback still exists. |
| 5 | `composeItemDescription()` | Truncates line item description to `250` chars. | Yes | Now higher than old 75 but still hard cap. |
| 6 | `splitAddressLines()` | Fallback address line `'.'` when resolved address lines are empty. | Yes | Placeholder injected into shipper/receiver address payload. |
| 7 | `splitAddressLines()` | Address line split width hardcoded to `45` chars and max 3 lines. | Yes | Impacts address truncation/format. |
| 8 | `buildExportDeclaration()` | Fallback invoice number format ``INV-${order.reference || Date.now()}``. | Yes | Auto-generated invoice number if missing. |
| 9 | `buildExportDeclaration()` | Fallback signature name `'Shipper'`. | Yes | Added when sender/label signature absent. |
|10| `buildExportDeclaration()` | Fallback signature title `'Sender'`. | Yes | Added when title absent. |
|11| `buildExportDeclaration()` | Injects `'GST: Paid'` or `'GST: Not Paid'` into invoice instructions. | Yes | Always includes one of these when invoice block built. |
|12| `buildExportDeclaration()` | Injects ``Payer of GST/VAT: ${order.payerOfVat || 'Receiver'}``. | Yes | Defaults to `'Receiver'`. |
|13| `buildExportDeclaration()` | Invoice instructions truncated to `300` chars. | Yes | Can cut combined remarks/tax lines. |
|14| `buildExportDeclaration()` | `exportReason` default `'Sale'`. | Yes | Sent when not provided by caller. |
|15| `buildExportDeclaration()` | `exportReasonType` default `'permanent'`. | Yes | Sent when not provided by caller. |
|16| `buildExportDeclaration()` | `placeOfIncoterm` fallback `order.receiver.city`. | Yes | Auto-derived fallback. |
|17| `buildDangerousGoodsValueAddedServices()` | Converts DG code to `UNxxxx` / `ID8000` format if prefix missing. | Yes | Normalization injection into DG VAS. |
|18| `buildDangerousGoodsValueAddedServices()` | Fallback DG `customDescription` `'Dangerous Goods'`. | Yes | Injected if both custom/proper shipping names absent. |
|19| `buildDangerousGoodsValueAddedServices()` | DG custom description truncated to `200` chars. | Yes | Hard cap. |
|20| `buildDangerousGoodsValueAddedServices()` | Dry ice fallback `dryIceWeight = 0.1` for HC. | Yes | Injected default numeric value. |
|21| `buildDgrShipmentPayload()` | Account fallback `'451012315'` for shipper account. | Yes | Critical hardcoded account fallback. |
|22| `buildDgrShipmentPayload()` | Label format default `'pdf'`. | Yes | In `outputImageProperties.encodingFormat`. |
|23| `buildDgrShipmentPayload()` | `pickup.isRequested` forced `false`. | Yes | Static behavior in payload. |
|24| `buildDgrShipmentPayload()` | `productCode` default `'P'`. | Yes | Service fallback. |
|25| `buildDgrShipmentPayload()` | `localProductCode` default `'P'`. | Yes | Service fallback. |
|26| `buildDgrShipmentPayload()` | `getRateEstimates` forced `false`. | Yes | Static behavior in payload. |
|27| `buildDgrShipmentPayload()` | Duties/taxes account fallback `'451012315'` when DDP/payer shipper branch. | Yes | Same account fallback appears again. |
|28| `buildDgrShipmentPayload()` | Requests all docs by default: `label`, `waybillDoc`, `invoice` with `isRequested: true`. | Yes | Hardcoded doc request set. |
|29| `buildDgrShipmentPayload()` | Trader type fallback `'business'` (shipper and receiver). | Yes | In `customerDetails.*.typeCode`. |
|30| `buildDgrShipmentPayload()` | Package reference fallback ``PKG-${i + 1}``. | Yes | Used when no order/sender/package reference. |
|31| `buildDgrShipmentPayload()` | Package description fallback `'Box'`. | Yes | If package description missing. |
|32| `buildDgrShipmentPayload()` | Package description truncation to `250` chars. | Yes | Hard cap. |
|33| `buildDgrShipmentPayload()` | `isCustomsDeclarable` forced `true`. | Yes | Static behavior in payload. |
|34| `buildDgrShipmentPayload()` | Shipment content description fallback `'Export Goods'`; may prepend `Pallets: N.`. | Yes | Injected if remarks/item description unavailable. |
|35| `buildDgrShipmentPayload()` | `incoterm` default `'DAP'`. | Yes | Fallback incoterm. |
|36| `buildDgrShipmentPayload()` | `unitOfMeasurement` forced `'metric'`. | Yes | Static behavior in payload. |
|37| `buildDgrShipmentPayload()` | Declared currency fallback chain ending in `'USD'`. | Yes | `detectedCurrency || order.currency || 'USD'`. |

## B) `backend/src/utils/shipmentNormalizer.js` (upstream defaults that flow into payload)

| # | Location | Hardcoded value / behavior | Reaches carrier payload? | Notes |
|---|---|---|---|---|
| 38 | `normalizeAddress()` | `phoneCountryCode` default `'+965'`. | Indirect | Present in normalized model; not directly used in builder phone formatting now. |
| 39 | items mapping | `quantity` default `1`. | Yes | Flows into invoice line quantities. |
| 40 | items mapping | `value` default `10`. | Yes | Flows into declared values/invoice prices. |
| 41 | items mapping | `currency` default `'USD'`. | Yes | Contributes to currency detection. |
| 42 | items mapping | `netWeight` default `0.1`. | Yes | Used in line item weight calculations. |
| 43 | packages mapping | package `weight` default `1 kg`. | Yes | Used in parcel/package payload. |
| 44 | packages mapping | dimensions defaults `10x10x10 cm`. | Yes | Used in parcel/package payload. |
| 45 | packages mapping | package `type` fallback `'my_box'`. | Indirect | Used in normalized object; not sent verbatim in DGR payload currently. |
| 46 | no-parcel fallback block | injects synthetic package with description `'Consolidated Items'`, type `'custom_jBox'`, dimensions `10x10x10`, weight fallback `1`. | Yes | This package can be sent to carrier payload. |
| 47 | normalized shipment | `incoterm` default `'DAP'`. | Yes | Used by payload builder. |
| 48 | normalized shipment | `currency` default `'USD'`. | Yes | Used by payload builder. |
| 49 | normalized shipment | `exportReason` default `'Sale'`. | Yes | Used by payload builder. |
| 50 | normalized invoice | invoice number default ``INV-${Date.now()}``. | Yes | Used if caller omits invoice number. |
| 51 | normalized invoice | signature name default `'Shipper'`. | Yes | Can flow into export declaration signature. |
| 52 | normalized invoice | signature title default `'Sender'`. | Yes | Can flow into export declaration signature. |

## C) `backend/src/adapters/DgrAdapter.js` (quote API hardcoded output)

> These are not shipment-create payload fields, but they are hardcoded values returned to your UI quote flow and can affect optional services shown.

| # | Location | Hardcoded value / behavior | Affects client quote payload/selection? | Notes |
|---|---|---|---|---|
| 53 | `getRates()` | Quote currency fallback `'KWD'`. | Yes | Used when shipment currency absent. |
| 54 | `getRates()` | Static optional services list: `II`, `WY`, `NN` with fixed prices `3.000`, `1.500`, `4.000`. | Yes | Not fetched from DHL live capabilities. |
| 55 | `getRates()` | Static services: `'DGR Express Worldwide'` (`P`, `15.000`) and `'DGR Express 12:00'` (`Y`, `22.500`). | Yes | Placeholder rates; not carrier-live. |

---

## Important clarifications

- The specific `ID8000` commercial-invoice phrase injection (`Consumer commodity (ID8000)`) was removed in the previous fix.
- There are still **many remaining hardcoded/default injections** (listed above), especially account fallback, default service/currency, generated invoice fields, and static quote/optional-service data.
- If your target is strict production behavior, each of these should be moved to one of:
  1) tenant/account configuration,
  2) carrier capability/rate response,
  3) explicit user input,
  with validation errors instead of silent fallback where compliance-sensitive.
