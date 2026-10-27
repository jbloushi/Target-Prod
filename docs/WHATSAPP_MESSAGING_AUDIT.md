# WhatsApp Messaging Audit

**Reviewed:** 2026-10-27
**Scope:** Static review of the production-matched application source, schema, UI, repository documentation, plus redacted live WhatsApp configuration, event rules, recent notification logs, Chatwoot synced approved-template definitions, and Chatwoot message/conversation response excerpts supplied on 2026-10-26.
**Not reviewed:** The external service's runtime route/parser wiring and non-secret effective configuration, plus provider status-transition timestamps and failure reasons keyed to each exact outbound message ID.

Use [the WhatsApp messaging system guide](WHATSAPP_MESSAGING.md) for architecture and agent workflow. The findings below retain the historical evidence; the current accepted policy and local implementation status follow.

## Accepted policy and local implementation (2026-10-27)

The user confirmed automatic shipment status/milestone, Salla-import, carrier-booking, and public-return messages should be disabled, while new shipments created by Phenix import still receive an initial shipper confirmation. That exception must use Chatwoot and the approved `shipment_confirmation_2` template; re-imports and updates do not resend. Public return requests require an operator to manually send `return_portal_v1` when appropriate.

Manual dispatch uses only the matching approved event/template/role contract and Chatwoot. It resolves current shipment contact data server-side, rejects phone overrides, blocks statuses `delivered`, `completed`, `cancelled`, and `returned`, blocks accepted or in-flight duplicates even when a caller asks to force, rechecks state at dispatch time, and logs skips with a reason. Queued lifecycle messages are closed as skipped; queued explicit action templates are revalidated before retry. Logs and UI responses distinguish accepted, delivered, skipped, queued, and failed outcomes.

The local change adds a unique `dispatchKey` and an atomic compare-and-set claim for duplicate dispatches. Before dropping the historical one-row-per-event uniqueness constraint, the migration ensures a standalone `shipmentId` index exists and reuses the current production FK-support index (`ShipmentNotificationLog_shipmentId_fkey`) when present. It records Chatwoot API acceptance as `submitted`. The migration must run before the updated application. After production reported an estimated 7,098 rows (22.16 MB data, 6.39 MB indexes), MySQL 8.0.45 rehearsals passed twice on both a matching existing-`_fkey` layout and a legacy composite-unique layout. Duplicate event rows were allowed and duplicate non-null dispatch keys rejected in each fixture. The `shipmentId` index itself does not need a production build on the observed live layout because it already exists; exact DDL timing was not measured. No live WhatsApp messages were sent while reviewing these changes. The public legacy status webhook now requires Meta raw-body HMAC or a configured service secret; hardcoded verification fallbacks are removed and the stale local fallback value was cleared. Receipt state transitions use atomic conditional updates, and unknown provider labels are ignored.

The standalone `Shipment_Whatsapp` worktree also contains local, uncommitted changes that disable live sends and leave only dry-run preview; the VPS state supplied earlier was PM2 `wa-dashboard` stopped and `AUTOSEND_ENABLED=false`. Production behavior must not be inferred from these source changes. Remaining release work includes confirming effective webhook secrets and callback headers, bounded retry behavior, delivery metric correction, and production verification.

## Historical path review and live evidence (2026-10-26)

The strict sender lifecycle template and corrected admin INSPECT display are deployed. The guarded 24–26 October backfill previewed 260 eligible shipments; after one controlled send, the remaining 259 reported `submitted` with no skipped or failed results. The first send's result was not included in the supplied final output. `submitted` confirms Chatwoot acceptance, not handset delivery. A new source-level sweep found that the same policy is not yet enforced by every shipment entry point:

The first production inbox lookup on 2026-10-26 returned seven templates because the four new templates had not yet synchronized. After the operator synced them, the inbox showed 12 templates total. The four shipment-action templates are now approved in English (`en`, UTILITY): `payment_request_v1` (recipient name, tracking number, amount due, payment URL), `location_request_v1` (receiver name, tracking number, location URL), `return_portal_v1` (recipient name, tracking number, return URL), and `customer_inquiry_start` (recipient name, tracking number, with static `Yes` and `No, thank you.` quick replies). The approved customer engagement body ends with “Please reply to this message to speak with”; preserve that exact provider-approved text. This closes the template-availability evidence gap for those four actions. The remaining eight synced templates are `account_statement_v1`, `hello_world`, `invoice_notification_v1`, `new_shipment_created`, `otptargetlogin`, `shipment_confirmation_2`, disabled `shipment_details`, and `shipment_tracking_quick`.

| Path | Current route | Alignment finding |
| --- | --- | --- |
| Shipment CRUD, carrier/status sync, fleet, Salla | `triggerShipmentNotification` to Chatwoot orchestration | Known sender lifecycle events use `shipment_confirmation_2`, strict inbox lookup, receiver values from shipment destination, and a notification log. |
| Phenix import | `phenixSync.service.js` → dedicated Chatwoot import-confirmation method | New non-terminal shipments send one approved `shipment_confirmation_2` to the shipper through Chatwoot. Updates and re-imports do not resend. The standalone sender is not used; production reported it stopped with `AUTOSEND_ENABLED=false`. Missing phone, terminal state, duplicate, or Chatwoot/template failure is logged as not accepted. |
| Warehouse review | `ShipmentLifecycleService.completeReview` to `whatsappIntegration.sendNotification` with explicit `shipment_confirmation_2` | The shared router forces shipment-bearing calls through Chatwoot and does not fall back. **P2:** The async caller only debug-logs a failed send and does not enqueue a durable retry. |
| Booking / return request | `triggerShipmentNotification('shipment_booked'/'return_requested')` | **P2:** Neither event has a target mapping, so these calls produce no message or notification log. Decide explicitly whether each is intended to notify. |
| Manual sender lifecycle, resend, queued lifecycle | Admin/controller and drainer to strict Chatwoot service | Aligned on sender, approved template, trusted phone resolution, and disabled provider fallback; atomic queue claims remain open. |
| Payment, location, return portal, engagement, manual receiver | Shared provider router; support composer sends directly through Chatwoot | The four required templates are now approved and synced. Shipment-bearing calls to the shared router are forced to Chatwoot and do not fall back to the remote service; exact template mapping and failure behavior are covered by focused tests. Confirm endpoint role/phone authorization separately before release. |
| Receiver location OTP | Public shipment controller to shared `sendNotification` with `otptargetlogin` and an OTP value | Routed through Chatwoot as an authentication template; logs redact the code and mask the destination phone. The application OTP lifetime remains five minutes by design; the provider-approved template says “Expires in 3 minutes,” which the operator has explicitly accepted. |
| Finance statements/invoices and user-opened `wa.me` links | Direct provider flow or browser handoff | Separate business/user actions; they are not represented as lifecycle notification logs. Do not include them in shipment delivery metrics. |

Additional shared risks confirmed in this sweep: per-recipient dispatch failures now throw from the durable worker path so the job can retry; the admin delivery-rate expression substitutes dispatched count when confirmed delivered is zero; the public status webhook lacks provider authentication; and Chatwoot receipt updates do not record transition timestamps or prevent status regression. The immediate lifecycle caller still needs a durable retry path for per-target failures. See issues 03, 07, and 08 for the corresponding remediation work.

**Release order:** (1) retain only the Phenix initial-create exception through Chatwoot and suppress milestone/status messages; add durable retry for warehouse and immediate lifecycle sends; (2) finish endpoint role/phone authorization and verify the four approved templates through Chatwoot; (3) authenticate callbacks, reconcile delivery receipts, correct delivery metrics, and add atomic queue claims. Verify each stage with scoped tests and redacted production counts before a bulk send.

## Executive summary

Automatic shipment lifecycle notifications are coded to target the shipper. The principal message-content defect is a role conflation: some template builders derive receiver-labeled variables from the shipper contact selected to receive the message. Other provider paths derive the receiver correctly but fall back through account/customer fields that may represent the shipper. The same event can therefore produce different party data depending on provider and template resolution.

The review also found inconsistent recipient-rule defaults, a resend path that may reuse a masked phone number, an authenticated-but-unscoped manual send endpoint, public WhatsApp status callbacks without Meta signature verification, personal data in provider logs/payload snapshots, and ambiguous status/queue behavior.

## Live production evidence

- Database config is enabled with provider `CHATWOOT` and fallback provider `SHIPMENT_WHATSAPP`. The Chatwoot host/account/inbox and a Chatwoot token are configured. The external service host is `msg.target-kw.com`.
- Quiet hours are enabled for `00:00`–`08:00` in `Asia/Kuwait`; delivery quiet-hours bypass is enabled.
- Persisted event rules enable sender notifications and disable receiver/customer rules for the supplied event set. This matches the intended shipper-only policy.
- Recent log summaries show automatic `delivered` and `out_for_delivery` entries addressed to role `sender`, provider `chatwoot`, no fallback, and status `submitted`.
- Those same logs record final template `new_shipment_created`, even though the event rules name `target_shipment_delivered` and `target_shipment_out_for_delivery`.
- The logged recipient-name fingerprint matches the shipper-name fingerprint, as expected for a shipper-addressed message. The five template-variable fingerprints do not match receiver name/phone fingerprints. Their lengths and event values are consistent with generic template variables (route, estimate, status, update time, tracking link), which contain no separate receiver name or phone.
- The supplied records have no delivery/read/receipt timestamps. `submitted` confirms request acceptance by the Chatwoot path; these records do not confirm handset delivery or reading.

The later Chatwoot export closes the message-copy gap: it includes approved template definitions and rendered outbound message content. The approved `new_shipment_created` template contains a tracking header and body fields for route, estimate, status, update time, and tracking URL; it has no Support footer. The application also sends a `content` string built by `buildPlainContent`, which appends `Support:` and a WhatsApp link. That explains the extra footer visible in the screenshot: it is application-generated content outside the approved template copy. The generic delivery message contains route, estimate, current status, update time, tracking URL, and this support link. It contains no receiver name or phone. The message is routed to a sender contact; it does not contain the sender's personal name/phone in the body either. Thus receiver details are absent while the recipient remains the shipper, and the extra support footer is added by the app.

An ID-matched read-only Chatwoot lookup was subsequently run for the 100 most recent notification rows. It matched every logged Chatwoot message ID to a Chatwoot message status: 39 were `delivered`, 59 were `read`, and 2 were `failed`. The application database still reports `submitted` on all 100 rows, so app-side receipt synchronization is not reflecting Chatwoot's per-message statuses. This closes whether these sampled messages reached delivered/read status, but the lookup did not return status-transition timestamps or failure reasons for the two failed messages.

## Prioritized findings

### 1. Template party data is coupled to the delivery recipient

**Priority:** P1
**Impact:** A shipper receives a message whose receiver/consignee name or phone can be the shipper's, or a generic fallback, depending on provider and template.

Evidence:

- `chatwootNotificationService.js` selects `sender` for automatic events (`EVENT_TARGETS`).
- Before the local remediation below, `buildSyncedTemplatePayload` filled `shipment_confirmation_2` receiver-name and receiver-phone variables from `target.name` and `target.phone`. For a sender-targeted notification, these were the shipper's values. The `shipment_tracking_quick` branch still uses the target fields if that template is selected.
- `buildTemplateParameters` uses `target.name` as a generic contact variable; that value does not declare whether the remote template slot means the message addressee or shipment receiver.
- In `whatsappIntegration.service.js`, `effectiveRecipientName` is the sender name when `role === 'sender'`; `buildMicroserviceVariables` uses receiver-specific values for some templates, but uses `effectiveRecipientName` for other templates such as delivered/payment-related messages.
- The direct Meta `shipment_confirmation_2` branch builds its “receiver” name from `context.recipientName`/`consigneeName`/`customerName`, while the general shipment context does not populate these with the resolved destination party; its phone variable is the delivery phone.
- Receiver fallback candidates include `shipment.customer?.name`, `customerName`, `customerPhone`, and other account-level fields, which can identify the shipper rather than the consignee.

**Recommendation:** Introduce an explicit resolved shipment-party context separate from delivery target. Define and validate variable meaning by event/template; use destination receiver fields for receiver slots and target fields only for greeting/addressing the actual WhatsApp recipient. Remove account-level receiver fallbacks unless the data contract proves they are consignee values. If required receiver details are absent, skip that template send with a visible reason rather than substituting shipper data. Add parity tests for each provider and templates with sender-targeted/receiver-content cases.

**Deployed remediation:** Automatic shipper lifecycle events select `shipment_confirmation_2`; its receiver slots use explicit destination/receiver-document values and the literal `[receiver name]` or `[receiver telephone]` placeholder when absent. The body mirrors the approved copy without an appended Support link. Focused automated checks cover routing, placeholders, and fail-closed behavior. The remaining production backfill batch submitted 259 messages through Chatwoot without send failures; delivery receipts remain a separate verification step.

### 2. Manual shipment send is not role- or shipment-scoped at the route

**Priority:** P1
**Impact:** Any authenticated caller reaching `/api/shipments/:trackingNumber/whatsapp/send` can select a recipient phone/role and force a send; controller code looks up the shipment globally and does not perform an object-level authorization check. The route applies `authController.protect` but no `authorize`/`authorizeAny` guard.

Evidence: `backend/src/routes/whatsapp.routes.js`; `sendShipmentWhatsApp` in `backend/src/controllers/adminWhatsAppLogs.controller.js` accepts `recipientPhone`, `recipientRole`, and `force`, then calls the shared send service.

**Recommendation:** Restrict the endpoint to an explicit operational permission, verify shipment access, constrain allowed recipient roles and phone overrides, and audit actor/reason. Keep deliberately receiver-facing actions on separately named, permissioned endpoints.

**Current remediation:** The manual route now checks shipment-level access. Caller-supplied phone, name, template, message, and force controls require an operational capability; recipient roles are validated. A sender lifecycle action uses the approved Chatwoot confirmation path and the shipment's shipper contact.

### 3. Public WhatsApp status webhook accepts unauthenticated status mutations

**Priority:** P1
**Impact:** A forged callback can mark a message delivered/read/failed or attach arbitrary receipt data to a matched notification log.

Evidence: `backend/src/routes/whatsapp.routes.js` exposes webhook POST aliases without auth; `whatsappWebhook.controller.js` parses Meta status receipts and updates `ShipmentNotificationLog` but does not validate Meta `X-Hub-Signature-256` against the raw request body. The GET verification path also accepts hardcoded fallback tokens and logs supplied verification tokens.

**Recommendation:** Require Meta app-secret HMAC verification for Meta payloads and a distinct shared secret/signature for remote-service callbacks; fail closed when secrets are missing. Remove hardcoded verification tokens and never log supplied tokens. Keep provider-specific callback verification separate.

**Current remediation (local):** Meta status callbacks now require `X-Hub-Signature-256` over the raw body using the configured Meta app secret. Legacy service callbacks require `X-WhatsApp-Webhook-Secret` or `X-Webhook-Secret` matching `WHATSAPP_WEBHOOK_SHARED_SECRET`; missing or invalid credentials return 401 before notification-log lookup. GET verification rejects the former built-in tokens and does not log supplied values. The obsolete fallback value was cleared from the local `system_settings.json` while preserving other settings. Receipt states are monotonic and unknown labels do not mutate logs. Focused tests cover valid and invalid Meta/service credentials, the legacy verification-token case, and status advancement/downgrade protection. Before deployment, configure the shared secret on the external callback sender; no production configuration has been changed.

### 4. Phone masking is inconsistent and breaks a resend path

**Priority:** P1
**Impact:** Chatwoot's event orchestrator creates logs with `recipientPhone: maskPhone(target.phone)`, but the admin resend endpoint passes the stored `recipientPhone` back to `sendNotification` as the destination. A masked value is not a usable phone number and may normalize to an incomplete number. The integration provider path stores unmasked phone values in `ShipmentNotificationLog`.

Evidence: `chatwootNotificationService.createLog`, `whatsappIntegration.service.js` log creation, and `adminWhatsAppLogs.controller.js::resendNotification`.

**Recommendation:** Keep a normalized delivery address in a protected encrypted/contact reference usable for retries, and a separate masked display field for routine UI. Resend should resolve the destination from a trusted shipment party/contact record and confirm it matches the logged recipient role. Do not treat a display mask as a send address.

**Current remediation:** Admin resend resolves a current destination from the shipment rather than using the masked log phone. Sender lifecycle resends use the approved Chatwoot service and update the exact log ID. A missing trusted phone blocks the send. A longer-term encrypted delivery-address reference and retention policy remain open.

### 5. Personal data is emitted to logs and retained in raw payload snapshots

**Priority:** P1
**Impact:** Phone numbers, receiver/shipper names, shipment data, template variables, and provider response objects can appear in app logs or JSON audit columns. Existing documentation says phone numbers are masked in logs/storage, but that is not true for all provider paths.

Evidence: `sendViaShipmentWhatsappMicroservice` logs the raw payload and full destination phone; direct Meta logs the full request payload; `ShipmentNotificationLog.payloadJson`/`responseJson` retain provider request/response data. `whatsappIntegration.service.js` also constructs `auditMetadata` with sender and consignee names/phones. Chatwoot's `createLog` masks its primary phone field, but that does not sanitize the payload/response snapshots or the other provider path.

**Recommendation:** Redact or remove phone/name/template-variable data from routine logs. Define which audit fields are necessary, mask or encrypt them at rest, apply retention/deletion rules, and restrict payload inspection to narrowly privileged roles. Correct the old claims in `docs/CHATWOOT_SHIPMENT_NOTIFICATIONS.md` by using the canonical guide.

### 6. Automatic recipient policy differs between code and Settings UI defaults

**Priority:** P1
**Impact:** The event target map, database seeding defaults, Settings UI fallback rules, and queue filters disagree. Code lifecycle targets and DB `DEFAULT_RULES` are sender-only; `SettingsPage.jsx::DEFAULT_WHATSAPP_RULES` includes receiver-enabled entries. The event orchestrator selects roles from `EVENT_TARGETS`, while direct/forced sends can supply a role explicitly. Operators can see receiver rules enabled without those rules being the source that chooses automatic target roles.

Evidence: `chatwootNotificationService.js::EVENT_TARGETS`/`getNotificationTargets`; `whatsAppConfig.service.js::DEFAULT_RULES`/`isEventEnabled`; `frontend/src/pages/SettingsPage.jsx::DEFAULT_WHATSAPP_RULES`; `whatsappQueueDrainer.service.js` sender-only filters.

**Recommendation:** Choose one authoritative automatic-recipient policy and derive event targets, rule defaults, UI display, queue filters, and tests from it. Make manual receiver sends explicit exceptions. Add a read-only effective-policy view showing provider, role, event rule, and source of each setting.

### 7. Provider configuration has multiple sources and nonuniform precedence

**Priority:** P2
**Impact:** A provider or enable/disable value can differ between file-backed settings, database config, Chatwoot environment config, user-token cache, and provider-specific routing. Core `sendNotification` merges DB config over file-backed settings, while Chatwoot orchestration and one-off methods read other combinations. Once the DB row exists, its default `enabled: true` can override a file-backed disabled value. The Settings provider dropdown omits `CHATWOOT`, although server paths support it, and does not expose the DB `enabled` field as a control.

Evidence: `whatsappIntegration.service.js::sendNotification`; `chatwootNotificationService.js::getChatwootConfig` and `sendShipmentNotification`; `whatsAppConfig.service.js::getConfig`; `SettingsPage.jsx` provider/config UI; `systemSettings.service.js` defaults.

**Recommendation:** Consolidate operational provider/enabled/template/rule configuration behind one typed service with explicit precedence, validation, secret handling, and effective-config diagnostics. Ensure all send entry points use that resolution.

### 8. “Sent”, “submitted”, “delivered”, and delivery-rate metrics are not consistent

**Priority:** P1
**Impact:** Admin reporting can show a 100% delivery rate when no handset delivery receipt exists: `deliveryRate` uses `(totalDelivered || totalDispatched)`, so zero delivered falls back to dispatched. Different flows also persist `SENT`, `submitted`, and provider-submitted states differently. In `whatsappIntegration.service.js`, the remote microservice can return `SKIPPED`, but the dispatch branch subsequently writes `status: 'SENT'` for any non-error return.

Evidence: `adminWhatsAppLogs.controller.js` delivery-rate calculation; direct/Chatwoot status updates in the two services; `sendViaShipmentWhatsappMicroservice` and its caller.

**Recommendation:** Define one status state machine and provider-normalization contract (queued → submitted/accepted → delivered → read, or failed/skipped). Preserve provider acceptance separately from handset receipt; never report a skipped provider result as sent. Compute delivery rate from eligible, receipt-confirmed records and show denominator/coverage.

### 9. Retry, manual dispatch, and background queue can race or disagree

**Priority:** P2
**Impact:** Immediate dispatch fallback, the durable job queue, `WhatsAppQueueDrainer`, admin batch dispatch, and resend have different duplicate checks and `force` behavior. The periodic drainer sends with `force: true`, which bypasses the shared service's quiet-hours/event-rule/dedup checks after its own checks. There is no visible atomic claim/lease on queued log records before dispatch, so concurrent admin/background processing can race.

Evidence: `chatwootNotificationService.triggerShipmentNotification`; `whatsappQueueDrainer.service.js`; `adminWhatsAppLogs.controller.js::dispatchQueuedNotifications`/`resendNotification`; `whatsappIntegration.service.js::sendNotification`.

**Recommendation:** Use one durable queue and atomic claim/idempotency key across providers, define retryable versus terminal failure classes, and record attempt count/next-attempt/dead-letter reason. Keep policy checks inside the dispatch service and make queue workers pass an explicit policy-approved retry capability instead of broad `force`.

**Current remediation:** The legacy drainer binds lifecycle retries to the exact queued log ID and skips events already submitted from another row. It also closes rows without a current shipper phone. Admin batch dispatch uses the approved Chatwoot lifecycle template and current shipper phone. An atomic claim/lease across concurrent workers remains open.

### 10. Existing Chatwoot setup/event documentation is stale

**Priority:** P2
**Impact:** The previous Chatwoot guide described sender and receiver automatic targets for several events, conflicting with current sender-only code. This can lead operators/agents to diagnose the wrong recipient path.

**Recommendation:** Use `docs/WHATSAPP_MESSAGING.md` as the canonical guide and the audit as the findings register. Update the template catalog and approved-provider contracts alongside implementation changes.

### 11. Live Chatwoot logs show delivery events using a generic shipment-created template

**Priority:** P1
**Impact:** Recent delivered/out-for-delivery messages are logged with `new_shipment_created`, whose code-level variables are route, estimated delivery, status, update time, and tracking link. They contain no separate receiver name or phone. This explains why the shipper receives a shipment update without the receiver details requested.

Evidence:

- Live `WhatsAppEventRule` rows enable sender templates `target_shipment_delivered` and `target_shipment_out_for_delivery`; receiver/customer rules are disabled.
- Recent live notification logs for `delivered` and `out_for_delivery` have `recipientRole: sender`, `provider: chatwoot`, `isFallback: false`, `templateName: new_shipment_created`, and `status: submitted`.
- `resolveEffectiveTemplatePayload` in `chatwootNotificationService.js` substitutes `new_shipment_created` when the chosen template is absent from the synced inbox templates and the generic template is available.
- The approved `new_shipment_created` body has no Support field, while `buildPlainContent` appends `Support:` and `context.supportWhatsappLink`; the Chatwoot request includes that generated text in `content` alongside `template_params`. The screenshot's extra support link therefore comes from application-generated message content, not from the approved template definition.
- The Chatwoot lifecycle path chooses the canonical event template; it does not use the persisted `WhatsAppEventRule.templateName` as the template selector. The event rules therefore do not guarantee which template is ultimately used.

**Recommendation:** Make event-template selection and availability explicit. Ensure the configured event template exists and has a documented variable contract; do not silently replace delivery milestones with a generic creation template unless that fallback's copy and variables are approved for that event. Populate receiver party fields independently from the shipper delivery target, and surface missing-template configuration clearly. Add tests asserting the final template and semantic variables after inbox-template resolution.

**Deployed remediation:** Automatic shipper lifecycle notifications now request the user-confirmed `shipment_confirmation_2`. If the inbox returns a template list that does not include it, dispatch fails visibly instead of falling back to a generic template. The Chatwoot `content` field mirrors the approved template body and omits the separately generated Support link. Missing receiver fields use the agreed literal placeholders. The production backfill confirmed Chatwoot acceptance, while handset delivery and the bypass paths above remain open.

## Suggested order

1. Fix the live event-template fallback and receiver/recipient data contract; add provider-parity coverage.
2. Close the manual-send authorization gap and authenticate status callbacks.
3. Repair resend destination handling and reduce PII exposure.
4. Unify automatic recipient policy and effective configuration.
5. Normalize send/delivery states and consolidate queue ownership.
6. Keep the canonical guide, template catalog, and issue status current.

## Evidence limits

The exact approved Chatwoot copy, rendered body, and current per-message delivery/read status were supplied for 100 sampled messages. The source for `routes/webhook.js`, `routes/send.js`, `services/messageLog.js`, `services/autoSend.js`, and `services/whatsapp.js` was reviewed at `/root/projects/shipment-whatsapp` commit `b3d5630d019172be6417a5355bc3374f7355f380`. It shows a JSON-backed per-WAMID log with delivered/read/failed timestamps and error fields, but those exact service-side records were not supplied. The webhook source also exposes `/sync-receipt` without visible authentication and makes Meta signature checking conditional on a configured app secret, while skipping it for requests carrying `X-Forwarded-From`; runtime route/parser wiring and whether those settings are configured remain unverified. Remaining evidence is the service-side records for the two failed Chatwoot message IDs (or provider failure details), actual status timestamps, plus `index.js` route/parser wiring and safe config-presence/forward-target metadata. No test send is needed.
