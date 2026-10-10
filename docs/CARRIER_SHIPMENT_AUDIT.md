# Carrier Shipment Accuracy Audit Runbook

This audit checks platform shipment records against live carrier tracking and, where supplied, authoritative carrier exports. It supports DHL/DGR, FedEx, Aramex, and OTE/LogesTechs. Internal and manual shipments are excluded because they have no external carrier record.

## What is compared

For every shipment in scope, the audit checks all carrier data currently available through the adapter or export:

- destination country;
- canonical shipment status;
- every carrier-sourced tracking-history event, including timestamp, location, description, and status;
- carrier-reported weight and piece count;
- carrier estimated delivery time; and
- carrier service code, shipment reference, origin route details, and destination/recipient name, phone, city, postal code, and street address when included in an export.

The platform destination, Phenix destination metadata, and recipient telephone prefix are also cross-checked. A telephone prefix is a warning signal only and is never used as authoritative correction data.

## Scope

The default query includes:

- every supported external-carrier shipment created in the previous 60 days; and
- older external-carrier shipments only when their status is not `delivered`, `completed`, `cancelled`, `canceled`, or `returned`.

The window may be set from 30 through 62 days with `--days`. The command is strictly read-only: it has no update or apply mode and performs no database writes.

## Verify the deployed version

```bash
curl -fsS https://api.target-kw.com/api/version
git rev-parse --short=12 HEAD
```

The API response `commit` must match the expected deployed Git commit. Deployments should set `RELEASE_SHA` and optionally `RELEASE_BUILT_AT`; the API falls back to the checkout SHA when Git metadata is present.

## Audit every carrier

Run a live, read-only audit against each configured carrier adapter:

```bash
npm run audit:carrier-shipments --prefix backend -- --days=60
```

Use `--carrier=DGR`, `--carrier=FEDEX`, `--carrier=ARAMEX`, or `--carrier=OTE` to audit one carrier. Use `--no-live` only when auditing exports without contacting carrier tracking APIs.

## Add carrier shipment-detail exports

Tracking APIs do not consistently return immutable booking fields such as destination country. Export those fields from each carrier platform as CSV or JSON and provide them with `--carrier-file`.

Recommended CSV fields are:

```csv
carrierCode,awb,destinationCountryCode,status,carrierWeight,carrierPieces,estimatedDelivery,serviceCode,reference,recipientName,recipientPhone,destinationCity,destinationPostalCode,destinationAddress,originCountryCode,originCity
ARAMEX,38290311684,OM,in_transit,2.5,1,2026-10-14T10:00:00.000Z,EXP,ORDER-1,Ali Customer,+96899112233,Muscat,100,Building 1 Street 2,KW,Kuwait City
```

Then run:

```bash
npm run audit:carrier-shipments --prefix backend -- \
  --days=60 \
  --carrier-file=/secure/path/carrier-shipment-details.csv
```

Store carrier exports outside the repository because they may contain customer shipment data.

## Reported Aramex shipment

The carrier platform identifies AWB `38290311684` as Oman (`OM`). Audit that confirmed carrier detail without altering production:

```bash
npm run audit:carrier-shipments --prefix backend -- \
  --carrier=ARAMEX \
  --days=60 \
  --carrier-destination=38290311684:OM
```

The command reports the discrepancy without modifying the shipment. Phone or Phenix conflicts are warning signals and never overwrite the platform country.

## Understanding results

The report groups discrepancies into:

- `destination_country`;
- `status`;
- `missing_tracking_events`;
- `platform_only_tracking_events`;
- `carrier_weight`;
- `carrier_pieces`;
- `estimated_delivery`;
- `internal_destination_signals`;
- `service_code` and `shipper_reference`;
- `recipient_name` and `recipient_phone`; and
- `origin_country`, `origin_city`, `destination_city`, `destination_postal_code`, and `destination_address`.

`trackingError` is reported separately when a carrier cannot be queried. Treat those rows as incomplete audits, not matching records.

The audit does not synchronize or correct any field. Findings must be reviewed and corrected through a separately approved operational process.
