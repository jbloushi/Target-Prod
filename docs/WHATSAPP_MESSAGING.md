# WhatsApp Messaging System Guide

Read this guide before changing WhatsApp shipment messages, recipient selection, templates, provider settings, retries, delivery webhooks, or message logs. It maps the production-matched application code and names the behavior that future changes must preserve or deliberately revise.

The current automatic shipment-notification policy is **shipper-only**. A notification's delivery recipient and the shipment's sender/receiver party data are separate concepts: the shipper may receive a message whose contents identify the receiver and describe the shipment.

All automatic shipper shipment lifecycle events use the approved `shipment_confirmation_2` template. OTP remains a separate authentication message and keeps its existing `otptargetlogin` template path. Login and receiver-location OTPs are generated with Node's cryptographic random generator; OTP values and full recipient numbers must not be written to logs. Development-only API responses can still include `devOtp`; production responses do not. The shipment confirmation uses receiver details from destination/receiver fields, with `[receiver name]` and `[receiver telephone]` as the explicit missing-value placeholders. If Chatwoot cannot verify that the approved template exists in the configured inbox, dispatch fails without plain-text or provider fallback.

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
| Shipment-event selection and Chatwoot path | `backend/src/services/chatwootNotificationService.js` | Event mapping, automatic recipient roles, Chatwoot contact/conversation lookup, templates, message send, status log writes, retry enqueue. |
| Provider routing and shipment template variables | `backend/src/services/whatsappIntegration.service.js` | Chooses microservice, Chatwoot, MOCK, or Meta path; normalizes recipient phone; builds provider template variables; creates shipment logs. |
| WhatsApp settings and event rules | `backend/src/services/whatsAppConfig.service.js` | Reads/writes database config and rules, masks API-returned secrets, evaluates quiet hours and per-role event rules. |
| File-backed system settings | `backend/src/services/systemSettings.service.js`, `backend/src/controllers/settings.controller.js` | Legacy/provider settings, Meta credentials, webhook verification token, system-settings API. |
| Admin settings UI | `frontend/src/pages/SettingsPage.jsx` | Provider and Chatwoot credentials, per-event/role rule editor, quiet hours. |
| Admin logs and actions | `backend/src/controllers/adminWhatsAppLogs.controller.js`, `frontend/src/pages/AdminWhatsAppLogsPage.jsx` | Search/filter shipment logs, resend, queued dispatch, microservice telemetry sync, manual shipment sends and payment notices. |
| Shipment-notification persistence | `backend/prisma/schema.prisma` (`ShipmentNotificationLog`) | Recipient role/name/phone, provider, status, template, provider IDs, payload/response JSON and error. |
| Config persistence | `backend/prisma/schema.prisma` (`WhatsAppConfig`, `WhatsAppEventRule`) | Provider settings, credentials, quiet-hours settings and event/role rules. |
| WhatsApp status callbacks | `backend/src/controllers/whatsappWebhook.controller.js`, `backend/src/routes/whatsapp.routes.js` | Meta and microservice receipt parsing; updates shipment notification status. |
| Chatwoot webhooks | `backend/src/controllers/integration.controller.js`, `backend/src/routes/integration.routes.js` | Signed Chatwoot event handling; distinct from Meta/microservice delivery-status callbacks. |
| Durable job queue | `backend/src/services/queue/jobWorker.js`, `backend/src/services/chatwootNotificationService.js` | Retries `chatwoot_notify` jobs after immediate-dispatch exceptions. |
| Legacy queued-log drain | `backend/src/services/whatsappQueueDrainer.service.js` | Periodically drains queued shipper notification logs. |
| Template catalog and copy references | `docs/whatsapp-template-catalog.md`, `backend/src/services/whatsappIntegration.service.js`, `backend/src/services/chatwootNotificationService.js` | Provider-side names, languages, and variable ordering. The remote microservice also contains template behavior outside this repository. |

## Message paths

### Automatic shipment lifecycle notifications

Shipment controllers, carrier synchronization, fleet workflows, lifecycle services, and other integrations call `chatwootNotificationService.triggerShipmentNotification`. The service schedules an immediate dispatch. A thrown dispatch error is enqueued as `chatwoot_notify`; `jobWorker.js` reloads the shipment and retries through `sendShipmentNotification`.

`EVENT_TARGETS` in `chatwootNotificationService.js` currently maps the automatic lifecycle event types to `sender`. The `whatsappQueueDrainer.service.js` also only drains sender/shipper/merchant logs and suppresses other queued roles. Treat this as a policy that is implemented in more than one place.

The event-to-status mapping is `mapStatusToNotificationEvent` in `chatwootNotificationService.js`. It maps status and description text to event types; an unrecognized status does not produce an automatic message there.

### Provider routing

`WhatsAppConfig` is loaded first by `whatsappIntegration.service.js`; its fields are merged over file-backed `systemSettings.whatsapp`. The selected provider sends through:

1. `SHIPMENT_WHATSAPP` / `TARGET_MSG`: remote `msg.target-kw.com` service.
2. `CHATWOOT`: Chatwoot API, with conditional fallback to the remote shipment WhatsApp service.
3. `META`: direct Meta Cloud API.
4. `MOCK`: synthetic local result.

The Chatwoot event orchestrator also has provider-specific branches and fallback behavior. Trace both `chatwootNotificationService.sendShipmentNotification` and `whatsappIntegration.sendNotification` before changing provider routing. The remote `msg.target-kw.com` source is not part of this repository, so its runtime implementation cannot be verified here.

### Separate, non-lifecycle message types

The shared WhatsApp integration service also handles login OTPs, account statements, invoices, payment links, receiver location requests, return-portal links, and customer-engagement messages. Their callers include `auth.controller.js`, `finance.controller.js`, `shipment-ops.controller.js`, `supportChat.controller.js`, and `ShipmentDetailsPage.jsx` actions. These direct/one-off paths do not all pass through the lifecycle event target list, event rule checks, or the same shipment-log flow. Do not assume the shipper-only automatic policy covers an explicitly initiated receiver message.

| Message class | Example entry points | Typical target |
| --- | --- | --- |
| Shipment created / reviewed | `ShipmentBookingService.js`, `ShipmentLifecycleService.js`, `shipment-public.controller.js` | Shipper for lifecycle notifications. |
| Shipment status milestone | `shipment-ops.controller.js`, `shipment-tracking.controller.js`, `carrierSyncCron.service.js`, `fleet.service.js` | Shipper for automatic event notifications. |
| Imported/commerce shipment | `phenixSync.service.js`, `sallaIntegration.service.js` | Integration-provided shipment party/phone; inspect each caller because some create notification logs/queues directly. |
| Manual shipment update/payment | `adminWhatsAppLogs.controller.js`, `shipment-ops.controller.js` | Caller-selected role/phone, subject to endpoint permissions and service rules. |
| Receiver self-service | `supportChat.controller.js`, `ShipmentDetailsPage.jsx` actions, `whatsappIntegration.service.js` helper methods | Receiver/consignee. |
| Finance/account | `finance.controller.js` → `sendStatementNotification` / `sendInvoiceNotification` | Organization billing contact. These are not shipment lifecycle notifications. |
| Login verification | `auth.controller.js` → `sendAuthOtp` | User phone. |

## Recipient policy and party data

Keep these values distinct throughout a change:

- **Delivery recipient**: the phone and contact that receive the WhatsApp. Automatic lifecycle messages currently target the sender/shipper.
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
| File/env-backed `systemSettings.whatsapp` | `enabled`, `provider`, `serviceUrl`, `phoneNumberId`, `businessAccountId`, `accessToken`, `webhookVerifyToken`, `metaAppId`, `metaAppSecret`; env names are `WHATSAPP_SERVICE_URL`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_WABA_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_META_APP_ID`, and `WHATSAPP_META_APP_SECRET`. |
| Chatwoot environment config | `CHATWOOT_ENABLED`, `CHATWOOT_BASE_URL`, `CHATWOOT_ACCOUNT_ID`, `CHATWOOT_INBOX_ID`, `CHATWOOT_API_ACCESS_TOKEN`, `CHATWOOT_ALLOW_PLAIN_TEXT_FALLBACK`, `CHATWOOT_TEMPLATE_CONFIG`, `CHATWOOT_WEBHOOK_SECRET`. |
| Telemetry sync | `ADMIN_TOKEN` is read by the admin telemetry-sync controller for the remote microservice request. |

The settings UI's `DEFAULT_WHATSAPP_RULES` includes receiver rules. The service's initial `DEFAULT_RULES`, the lifecycle `EVENT_TARGETS`, and the background drainer are sender-only. Existing database rules can therefore look different from code/UI fallbacks; inspect the persisted rows before diagnosing a live send.

## Templates and payloads

The same logical message can be assembled by more than one path:

- Chatwoot uses `buildSyncedTemplatePayload`, `buildTemplateParameters`, and `buildPlainContent` in `chatwootNotificationService.js`.
- The remote WhatsApp service path uses `buildMicroserviceVariables` and `sendViaShipmentWhatsappMicroservice` in `whatsappIntegration.service.js`.
- Direct Meta uses `buildMetaMessagePayload` in `whatsappIntegration.service.js`.
- Chatwoot's template resolution can substitute an inbox template when the requested template is unavailable. The confirmed shipper lifecycle template `shipment_confirmation_2` is strict: dispatch fails visibly if Chatwoot cannot return the inbox template list or if that list omits the approved template.

The confirmed automatic shipper lifecycle path uses the approved Chatwoot template `shipment_confirmation_2` (`en_US`) for shipment creation and status milestones. The WhatsApp destination remains the shipper. Its header is the shipment tracking number; body variables are invoice/reference, shipment creation date, receiver name, receiver phone, and tracking URL. Resolve receiver fields only from explicit destination or receiver-document fields. If receiver name or phone is missing, send the literal placeholders `[receiver name]` or `[receiver telephone]`; never substitute the shipper's details or fabricate a phone. Render Chatwoot `content` to match the approved template copy; do not append a Support link outside the approved template.

When editing a message, record a contract for each supported provider: event, template name/language, delivery recipient, each numbered variable's business meaning and source field, fallback behavior for missing receiver data, and the approved template version. Keep this contract aligned with `docs/whatsapp-template-catalog.md` and remote WhatsApp Business templates.

## Queue, deduplication, and delivery state

`ShipmentNotificationLog.status` is a string, and code currently writes several case/style variants, including `QUEUED`, `SENT`, `DELIVERED`, `READ`, `FAILED`, `SKIPPED`, and lowercase `submitted`/`failed`. A provider API accepting a request is not handset delivery confirmation. Read receipt webhooks can advance status to delivered/read.

The admin API can:

- query/filter logs and counts;
- resend a selected log;
- dispatch queued shipper records;
- sync recent remote microservice telemetry;
- manually send a shipment notification/payment notice.

There is also an automatic queue drainer. Before changing retries, check all three: `chatwoot_notify` durable jobs, queued `ShipmentNotificationLog` draining, and admin batch dispatch. Their duplicate guards, provider choice, role filtering, and `force` handling differ.

`ShipmentNotificationLog.payloadJson` and `responseJson` retain provider payloads and receipts. These can contain phone numbers, recipient/receiver details, template variables, provider contact/message objects, or failure data. The admin page shows payload and message previews to authorized users. Treat the fields as personal data and redact them from copied diagnostics.

The schema's operational fields include `shipmentId`, `trackingNumber`, `eventType`, `recipientRole`, `recipientName`, `recipientPhone`, `provider`, `isFallback`, `fallbackReason`, Chatwoot account/inbox/contact/conversation/message IDs, `templateName`, `payloadJson`, `responseJson`, `status`, `errorMessage`, `sentAt`, and created/updated timestamps. The admin logs page exposes recipient filters, provider/status filters, payload/template previews, resend, queued dispatch, and telemetry sync. A sent-log search is not a full audit of OTP/account/finance traffic because those paths may not create `ShipmentNotificationLog` rows.

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

Relevant existing test files include `backend/__tests__/chatwootOutboundDispatch.test.js`, `backend/__tests__/chatwootCrmSync.test.js`, `backend/__tests__/whatsappTemplateCatalogParity.test.js`, `backend/__tests__/whatsappTemplateCatalogAdversarial.test.js`, `backend/__tests__/whatsappRouter.test.js`, `backend/__tests__/whatsappRouterAdversarial.test.js`, and `backend/__tests__/whatsappChatwootGpsParity.test.js`. Read their assertions before changing behavior. This audit did not run tests.
