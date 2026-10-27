# WhatsApp Messaging System Guide

Read this guide before changing WhatsApp shipment messages, recipient selection, templates, provider settings, retries, delivery webhooks, or message logs. It maps the production-matched application code and names the behavior that future changes must preserve or deliberately revise.

Shipment messages use Chatwoot and approved templates. Initial shipment confirmations created by Phenix import are sent automatically to the shipper using `shipment_confirmation_2`. Status/milestone changes, Salla imports, carrier bookings, and public return requests do not trigger automatic messages; public returns require an operator to send `return_portal_v1` manually. Other shipment messages are operator-initiated.

**Confirmed transport policy (2026-10-26):** every application-dispatched shipment message goes through Chatwoot. The manual shipment confirmation uses `shipment_confirmation_2` and targets the shipper. Payment, receiver location, return, engagement, and receiver-location OTP keep their own approved templates and recipients. User-opened `wa.me` links remain human handoffs; they are not sent or receipt-tracked by the application.

**Confirmed send safeguards (2026-10-27):** do not dispatch or retry a shipment message after status `delivered`, `completed`, `cancelled`, or `returned`; block duplicate accepted or in-flight event/template/recipient attempts even when a caller asks to force a resend; re-resolve current shipment/recipient data immediately before dispatch; reject unapproved event/template/role combinations and caller-supplied phone overrides; and persist a `SKIPPED` log with a machine-readable reason for policy blocks. An accepted Chatwoot submission is not proof of handset delivery.

**Production inbox verification (2026-10-26):** the `Target KW Logistics WhatsApp` inbox now reports the following four approved shipment templates, all language `en` and category `UTILITY`:

| Template | Body parameter order | Button components |
| --- | --- | --- |
| `payment_request_v1` | Recipient name, tracking number, amount due, payment URL | None; URL appears in body. |
| `location_request_v1` | Receiver name, tracking number, location URL | None; URL appears in body. |
| `return_portal_v1` | Recipient name, tracking number, return URL | None; URL appears in body. |
| `customer_inquiry_start` | Recipient name, tracking number | Static quick replies `Yes` and `No, thank you.` |

`customer_inquiry_start`'s approved body ends with “Please reply to this message to speak with” before the quick reply buttons. Keep the content aligned with the approved component; edits require a new provider approval. The application must obtain the template list from the configured Chatwoot inbox, require the exact approved template, match the body parameter count, and fail without provider or template substitution. The support reply composer must use the same variable order. Application-initiated receiver location OTP uses `otptargetlogin` through Chatwoot and records only redacted OTP payload data in shipment logs; it does not use the location-request template.

Manual shipper shipment confirmations use the approved `shipment_confirmation_2` template. OTP remains a separate authentication message and keeps its existing `otptargetlogin` template path. Login and receiver-location OTPs are generated with Node's cryptographic random generator; OTP values and full recipient numbers must not be written to logs. Development-only API responses can still include `devOtp`; production responses do not. The shipment confirmation uses receiver details from destination/receiver fields, with `[receiver name]` and `[receiver telephone]` as the explicit missing-value placeholders. If Chatwoot cannot verify that the approved template exists in the configured inbox, dispatch fails without plain-text or provider fallback.

The guarded historical resend utility is `backend/scripts/resend-shipment-confirmations.js`. It filters `Shipment.createdAt` by inclusive Asia/Kuwait dates, skips shipments with a successful confirmation log or an in-flight confirmation, and defaults to read-only dry-run. Sending requires both the printed candidate count and an exact date-range confirmation token; it disables provider fallback.

From the deployed backend directory, review the candidate set first:

```bash
node scripts/resend-shipment-confirmations.js --from=2026-10-25 --to=2026-10-26
```

After reviewing the count and masked recipients, replace `N` with the exact `Ready to send` count printed by that dry-run:

```bash
node scripts/resend-shipment-confirmations.js --from=2026-10-25 --to=2026-10-26 --send --confirm=RESEND-2026-10-25-2026-10-26 --confirm-count=N
```

## System map

| Concern | Main implementation | Responsibility |
| --- | --- | --- |
| Shipment-event selection and Chatwoot path | `backend/src/services/chatwootNotificationService.js` | Manual action/template validation, the narrow Phenix-created shipment exception, terminal-state and duplicate guards, Chatwoot contact/conversation lookup, status log writes. Other automatic lifecycle triggers are disabled. |
| Provider routing and shipment template variables | `backend/src/services/whatsappIntegration.service.js` | Forces shipment-bearing messages through Chatwoot, resolves the current shipment/recipient, validates the action contract, and builds template variables; non-shipment messages retain their separate provider routing. |
| WhatsApp settings and event rules | `backend/src/services/whatsAppConfig.service.js` | Reads/writes database config and rules, masks API-returned secrets, evaluates quiet hours and per-role event rules. |
| File-backed system settings | `backend/src/services/systemSettings.service.js`, `backend/src/controllers/settings.controller.js` | Legacy/provider settings, Meta credentials, webhook verification token, system-settings API. |
| Admin settings UI | `frontend/src/pages/SettingsPage.jsx` | Provider and Chatwoot credentials, per-event/role rule editor, quiet hours. |
| Admin logs and actions | `backend/src/controllers/adminWhatsAppLogs.controller.js`, `frontend/src/pages/AdminWhatsAppLogsPage.jsx` | Search/filter shipment logs, resend, queued dispatch, microservice telemetry sync, manual shipment sends and payment notices. |
| Shipment-notification persistence | `backend/prisma/schema.prisma` (`ShipmentNotificationLog`) | Recipient role/name/phone, provider, status, template, provider IDs, payload/response JSON and error. |
| Config persistence | `backend/prisma/schema.prisma` (`WhatsAppConfig`, `WhatsAppEventRule`) | Provider settings, credentials, quiet-hours settings and event/role rules. |
| WhatsApp status callbacks | `backend/src/controllers/whatsappWebhook.controller.js`, `backend/src/routes/whatsapp.routes.js` | Meta and microservice receipt parsing; updates shipment notification status. |
| Chatwoot webhooks | `backend/src/controllers/integration.controller.js`, `backend/src/routes/integration.routes.js` | Signed Chatwoot event handling; distinct from Meta/microservice delivery-status callbacks. |
| Durable job queue | `backend/src/services/queue/jobWorker.js`, `backend/src/services/chatwootNotificationService.js` | Retries `chatwoot_notify` jobs after immediate-dispatch exceptions. |
| Legacy queued-log drain | `backend/src/services/whatsappQueueDrainer.service.js` | Closes legacy lifecycle queue rows; retries only approved explicit action templates after re-checking shipment state and duplicates. |
| Template catalog and copy references | `docs/whatsapp-template-catalog.md`, `backend/src/services/whatsappIntegration.service.js`, `backend/src/services/chatwootNotificationService.js` | Provider-side names, languages, and variable ordering. The remote microservice also contains template behavior outside this repository. |

## Message paths

### Shipment trigger policy

Shipment controllers, carrier synchronization, fleet workflows, booking, Salla, and public return workflows may still call `chatwootNotificationService.triggerShipmentNotification`. That entry point returns `MANUAL_DISPATCH_REQUIRED` and does not send or enqueue a job. The only automatic shipment-message exception is the first non-terminal shipment creation by Phenix import, which calls the dedicated Chatwoot confirmation path. The same rule applies to legacy `chatwoot_notify` jobs: dispatch requires explicit manual authorization and terminal-state checks.

Phenix import sends one initial shipper confirmation for a newly created, non-terminal shipment through Chatwoot. Updates and re-imports do not send another confirmation. Missing shipper details, terminal shipment status, duplicate accepted sends, unavailable approved templates, or Chatwoot errors prevent acceptance and are recorded. The standalone Phenix sender remains disabled; shipment messages are dispatched by the Target backend through Chatwoot. Salla import and carrier booking continue their business workflows without triggering shipment WhatsApp messages.

The event-to-status mapping remains available for display/history logic, but it no longer initiates customer WhatsApp delivery.

### Manual shipment actions

The only allowed application dispatches are explicit UI/self-service actions with the matching approved template and recipient:

| Action | Event/template | Recipient |
| --- | --- | --- |
| Shipment confirmation | `shipment_created` or guarded `shipment_created_backfill` / `shipment_confirmation_2` | Sender/shipper |
| Payment request | `payment_link_ready` / `payment_request_v1` | Sender or receiver, explicitly selected |
| Location request | `location_request` / `location_request_v1` | Receiver |
| Return portal | `return_portal` / `return_portal_v1` | Receiver |
| Customer engagement | `customer_engagement` / `customer_inquiry_start` | Receiver |
| Receiver location verification | `auth_otp` / `otptargetlogin` | Receiver; OTP can be requested again |

Other template, event, or recipient combinations are rejected and logged as skipped. The current shipment phone is resolved server-side; caller-supplied recipient phones are rejected. Terminal shipments and duplicate accepted/in-flight actions are blocked. A shipment reaching a terminal status while an explicit message is queued causes that queued message to be skipped at dispatch time.

### Provider routing

`WhatsAppConfig` is loaded first by `whatsappIntegration.service.js`; its fields are merged over file-backed `systemSettings.whatsapp`. For non-shipment traffic, provider settings can select:

1. `SHIPMENT_WHATSAPP` / `TARGET_MSG`: remote `msg.target-kw.com` service.
2. `CHATWOOT`: Chatwoot API, with conditional fallback to the remote shipment WhatsApp service.
3. `META`: direct Meta Cloud API.
4. `MOCK`: synthetic local result.

Shipment-bearing sends bypass that provider selection and are forced through Chatwoot; configuration errors fail closed without provider fallback. Login OTP and finance/account messages remain separate flows. The remote `msg.target-kw.com` source is not part of this repository; the standalone Phenix sender is independently disabled in its local source and was reported stopped on the VPS with `AUTOSEND_ENABLED=false`.

### Receipt webhook authentication

The legacy WhatsApp status routes remain public because Meta and the external WhatsApp service call them, but they authenticate before looking up or changing a notification log. Meta callbacks require `X-Hub-Signature-256` over the exact raw request body using `WHATSAPP_META_APP_SECRET` (or the configured `whatsapp.metaAppSecret`). Legacy Evolution/microservice callbacks require `X-WhatsApp-Webhook-Secret` or `X-Webhook-Secret` matching `WHATSAPP_WEBHOOK_SHARED_SECRET`. Missing secrets fail closed with HTTP 401. Configure the corresponding secrets on the calling service before deployment. The GET Meta verification route requires an explicitly configured `WHATSAPP_WEBHOOK_VERIFY_TOKEN`; no built-in fallback token is accepted or logged. Receipt transitions use an atomic conditional database update: late or unknown provider states cannot downgrade or overwrite a later state, including when callbacks overlap.

### Separate, non-lifecycle message types

The shared WhatsApp integration service also handles login OTPs, account statements, invoices, payment links, receiver location requests, return-portal links, and customer-engagement messages. Their callers include `auth.controller.js`, `finance.controller.js`, `shipment-ops.controller.js`, `supportChat.controller.js`, and `ShipmentDetailsPage.jsx` actions. Shipment actions are manually initiated and pass the strict template/recipient contract; login OTP and finance/account messages remain separate flows.

| Message class | Example entry points | Typical target |
| --- | --- | --- |
| Shipment created / reviewed | Shipment CRUD and booking/lifecycle callers | No automatic dispatch from ordinary UI creation or review. Phenix import has the separate initial-confirmation exception below. |
| Phenix import creates a shipment | `phenixSync.service.js`, `phenixSyncCron.service.js` | Chatwoot sends the initial `shipment_confirmation_2` to the shipper; re-imports and updates do not resend. |
| Shipment status milestone | `shipment-ops.controller.js`, `shipment-tracking.controller.js`, `carrierSyncCron.service.js`, `fleet.service.js` | No automatic WhatsApp dispatch; status updates still persist. |
| Salla/commerce shipment | `sallaIntegration.service.js` | Import continues; import-triggered WhatsApp dispatch is disabled. |
| Manual shipment update/payment | `adminWhatsAppLogs.controller.js`, `shipment-ops.controller.js` | Approved event/template/role combinations only; current party phone is resolved on the server. |
| Receiver self-service | `supportChat.controller.js`, `ShipmentDetailsPage.jsx` actions, `whatsappIntegration.service.js` helper methods | Receiver/consignee; approved template only and no terminal shipment. |
| Finance/account | `finance.controller.js` → `sendStatementNotification` / `sendInvoiceNotification` | Organization billing contact. These are not shipment lifecycle notifications. |
| Login verification | `auth.controller.js` → `sendAuthOtp` | User phone. |

## Recipient policy and party data

Keep these values distinct throughout a change:

- **Delivery recipient**: the phone and contact that receive the WhatsApp. Manual shipment confirmation targets the sender/shipper; the approved explicit actions target the selected sender or receiver as listed above.
- **Shipper**: the shipment origin party (`shipment.origin`, with sender/account fallback fields).
- **Receiver/consignee**: the shipment destination party (`shipment.destination`, plus explicit receiver fields where applicable).
- **Template variable**: the semantic value expected in one particular approved template slot. It must be mapped by template contract, not inferred from the delivery recipient role.

The provider service computes `resolvedSenderName`/`Phone`, `resolvedReceiverName`/`Phone`, and `effectiveRecipientName`. Some template builders use the sender-bound `target.name` or `effectiveRecipientName` for a slot whose copy describes the receiver. Other provider builders use receiver fields, but some receiver fallbacks include customer/account fields. This is the source of provider-dependent party mismatches. See the concrete finding in [the audit](WHATSAPP_MESSAGING_AUDIT.md#1-template-party-data-is-coupled-to-the-delivery-recipient).

## Settings and precedence

There are two configuration stores:

- Database config/rules: `WhatsAppConfig` and `WhatsAppEventRule`, managed by `/api/settings/whatsapp` and shown in the Settings page.
- File-backed `system_settings.json`/environment settings: provider, enabled flag, service URL, Meta credentials, and webhook verification token.

In the core send path, database config overrides file-backed settings. The Chatwoot orchestration path separately reads database config or system settings, while Chatwoot credentials can also come from `config.js` environment values and a cached database/user token. The resulting precedence is not uniform across every send entry point.

The database secret fields are masked in GET responses but stored as ordinary fields in the schema. Secret masking is an API display behavior, not encryption at rest. Check provider, enabled state, event/role rule, quiet-hours config, and fallback settings for the specific path being debugged. Never paste actual config values into issue comments or logs.

| Store | Setting names used by this code |
| --- | --- |
| Database `WhatsAppConfig` | `enabled`, `provider`, `fallbackProvider`, `serviceUrl`, `apiKey`, `phoneId`, `chatwootBaseUrl`, `chatwootAccountId`, `chatwootInboxId`, `chatwootApiToken`, `quietHoursEnabled`, `quietHoursStart`, `quietHoursEnd`, `quietHoursTimezone`, `allowDeliveryQuietHours`. |
| Database `WhatsAppEventRule` | `eventType`, `recipientRole`, `templateName`, `enabled`, `allowQuietHoursBypass`. |
| File/env-backed `systemSettings.whatsapp` | `enabled`, `provider`, `serviceUrl`, `phoneNumberId`, `businessAccountId`, `accessToken`, `webhookVerifyToken`, `metaAppId`, `metaAppSecret`; env names are `WHATSAPP_SERVICE_URL`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_WABA_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_META_APP_ID`, `WHATSAPP_META_APP_SECRET`, and `WHATSAPP_WEBHOOK_SHARED_SECRET`. |
| Chatwoot environment config | `CHATWOOT_ENABLED`, `CHATWOOT_BASE_URL`, `CHATWOOT_ACCOUNT_ID`, `CHATWOOT_INBOX_ID`, `CHATWOOT_API_ACCESS_TOKEN`, `CHATWOOT_ALLOW_PLAIN_TEXT_FALLBACK`, `CHATWOOT_TEMPLATE_CONFIG`, `CHATWOOT_WEBHOOK_SECRET`. |
| Telemetry sync | `ADMIN_TOKEN` is read by the admin telemetry-sync controller for the remote microservice request. |

The Settings page shows shipment event rules as disabled/read-only. The dispatch service enforces its source policy independently of historical `WhatsAppEventRule` rows: old enabled rules cannot re-enable automatic lifecycle messages, and only the dedicated Phenix initial-create capability can send automatically.

## Templates and payloads

The same logical message can be assembled by more than one path:

- Chatwoot uses `buildSyncedTemplatePayload`, `buildTemplateParameters`, and `buildPlainContent` in `chatwootNotificationService.js`.
- The remote WhatsApp service path uses `buildMicroserviceVariables` and `sendViaShipmentWhatsappMicroservice` in `whatsappIntegration.service.js`.
- Direct Meta uses `buildMetaMessagePayload` in `whatsappIntegration.service.js`.
- Chatwoot's template resolution can substitute an inbox template when the requested template is unavailable. The confirmed shipper lifecycle template `shipment_confirmation_2` is strict: dispatch fails visibly if Chatwoot cannot return the inbox template list or if that list omits the approved template.

The manual shipper confirmation path uses the approved Chatwoot template `shipment_confirmation_2` (`en_US`). The WhatsApp destination is the shipper. Its header is the shipment tracking number; body variables are invoice/reference, shipment creation date, receiver name, receiver phone, and tracking URL. Resolve receiver fields only from explicit destination or receiver-document fields. If receiver name or phone is missing, send the literal placeholders `[receiver name]` or `[receiver telephone]`; never substitute the shipper's details or fabricate a phone. Render Chatwoot `content` to match the approved template copy; do not append a Support link outside the approved template.

When editing a message, record a contract for each supported provider: event, template name/language, delivery recipient, each numbered variable's business meaning and source field, fallback behavior for missing receiver data, and the approved template version. Keep this contract aligned with `docs/whatsapp-template-catalog.md` and remote WhatsApp Business templates.

## Queue, deduplication, and delivery state

`ShipmentNotificationLog.status` is a string, and code currently writes several case/style variants, including `QUEUED`, `SENT`, `DELIVERED`, `READ`, `FAILED`, `SKIPPED`, and lowercase `submitted`/`failed`. A provider API accepting a request is not handset delivery confirmation. Read receipt webhooks can advance status to delivered/read.

The admin API can:

- query/filter logs and counts;
- resend a selected log;
- dispatch queued approved manual action records; legacy lifecycle rows are skipped;
- sync recent remote microservice telemetry;
- manually send a shipment notification/payment notice.

Legacy background mechanisms still exist. `chatwoot_notify` jobs are blocked unless manually authorized; the queued-log drainer and admin batch processor skip lifecycle events and retry only approved explicit templates. Every send re-checks terminal shipment state and duplicate accepted/in-flight attempts. These separate queues should be retired or unified in a later queue/idempotency change.

Queued lifecycle rows are marked `SKIPPED` with `AUTOMATIC_SHIPMENT_MESSAGES_DISABLED`. Approved manual action queues resolve current party phone data from the shipment, and terminal or duplicate attempts are marked `SKIPPED` with a reason such as `SHIPMENT_TERMINAL`, `DUPLICATE_ALREADY_SUBMITTED`, or `DISPATCH_ALREADY_IN_FLIGHT`. A `submitted` status means Chatwoot accepted the request, not handset delivery.

`ShipmentNotificationLog.payloadJson` and `responseJson` retain provider payloads and receipts. These can contain phone numbers, recipient/receiver details, template variables, provider contact/message objects, or failure data. The admin page shows payload and message previews to authorized users. Treat the fields as personal data and redact them from copied diagnostics.

The schema's operational fields include `shipmentId`, `trackingNumber`, `dispatchKey`, `eventType`, `recipientRole`, `recipientName`, `recipientPhone`, `provider`, `isFallback`, `fallbackReason`, Chatwoot account/inbox/contact/conversation/message IDs, `templateName`, `payloadJson`, `responseJson`, `status`, `errorMessage`, `sentAt`, and created/updated timestamps. `dispatchKey` is a unique SHA-256 key for one shipment/event/template/role/recipient and protects concurrent attempts; OTP attempts intentionally do not share that key. The admin logs page exposes recipient filters, provider/status filters, payload/template previews, resend, queued dispatch, and telemetry sync. A sent-log search is not a full audit of OTP/account/finance traffic because those paths may not create `ShipmentNotificationLog` rows.

## Webhooks and delivery receipts

`whatsappWebhook.controller.js` accepts Meta Cloud status events and several remote-microservice callback shapes, matches receipts by provider message ID, and updates log state. It also forwards receipts to `msg.target-kw.com`. This endpoint is separate from the signed Chatwoot event webhook in `integration.controller.js`.

For a delivery investigation, record the log ID, tracking number, recipient role, provider, message ID, template, normalized status, status timestamp, and whether that value came from the provider response, webhook, or telemetry sync. Avoid recording unmasked phone numbers or raw auth headers/tokens.

## Safe investigation workflow for agents

1. Read this guide and [the current audit](WHATSAPP_MESSAGING_AUDIT.md); inspect open local tickets in `.scratch/whatsapp-messaging/`.
2. Identify the exact entry point and provider before reading template variables. Trace role/phone, semantic party data, rule/quiet-hours/duplicate checks, provider request, and log update end to end.
3. Compare database rules and provider settings with code defaults without exposing secret values. For actual production state, use an authorized settings/log view or ask an operator for redacted evidence; repository defaults are not proof of live config.
4. Check the template catalog and provider-side approved template variable order. The remote service implementation is external to this repo.
5. For a behavior change, update the relevant template-contract tests, this guide/audit, and the local `.scratch/whatsapp-messaging/` issue status. Do not send live test messages unless specifically authorized.

## Primary code tests

Relevant tests include `backend/__tests__/chatwootOutboundDispatch.test.js`, `backend/__tests__/shipmentWhatsAppPolicy.service.test.js`, `backend/__tests__/shipmentWhatsAppDispatch.test.js`, and `backend/__tests__/shipmentWhatsAppDispatchClaim.test.js`, plus the template/router parity suites listed above. On 2026-10-27, the three focused safeguards suites passed (21 tests) and the outbound-dispatch suite passed (38 tests); these tests mock the database/provider boundaries and send no live WhatsApp messages. Prisma schema validation also passed with a disposable, nonconnected MySQL URL. These checks do not rehearse the SQL migration or replace a full release-readiness review.
