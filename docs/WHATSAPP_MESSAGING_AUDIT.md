# WhatsApp Messaging Audit

**Reviewed:** 2026-10-26
**Scope:** Static review of the production-matched application source, schema, UI, repository documentation, plus redacted live WhatsApp configuration, event rules, recent notification logs, Chatwoot synced approved-template definitions, and Chatwoot message/conversation response excerpts supplied on 2026-10-26.
**Not reviewed:** The external service's runtime route/parser wiring and non-secret effective configuration, plus provider status-transition timestamps and failure reasons keyed to each exact outbound message ID.

Use [the WhatsApp messaging system guide](WHATSAPP_MESSAGING.md) for architecture and agent workflow. This audit records code-evidenced risks and recommended work; it does not change message behavior.

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

**Local remediation:** Automatic shipper lifecycle events select `shipment_confirmation_2`; its receiver slots use explicit destination/receiver-document values and the literal `[receiver name]` or `[receiver telephone]` placeholder when absent. The body mirrors the approved copy without an appended Support link. Focused automated checks cover routing, placeholders, and fail-closed behavior. Production readiness still requires deployment verification and a real approved-template dry-run.

### 2. Manual shipment send is not role- or shipment-scoped at the route

**Priority:** P1
**Impact:** Any authenticated caller reaching `/api/shipments/:trackingNumber/whatsapp/send` can select a recipient phone/role and force a send; controller code looks up the shipment globally and does not perform an object-level authorization check. The route applies `authController.protect` but no `authorize`/`authorizeAny` guard.

Evidence: `backend/src/routes/whatsapp.routes.js`; `sendShipmentWhatsApp` in `backend/src/controllers/adminWhatsAppLogs.controller.js` accepts `recipientPhone`, `recipientRole`, and `force`, then calls the shared send service.

**Recommendation:** Restrict the endpoint to an explicit operational permission, verify shipment access, constrain allowed recipient roles and phone overrides, and audit actor/reason. Keep deliberately receiver-facing actions on separately named, permissioned endpoints.

### 3. Public WhatsApp status webhook accepts unauthenticated status mutations

**Priority:** P1
**Impact:** A forged callback can mark a message delivered/read/failed or attach arbitrary receipt data to a matched notification log.

Evidence: `backend/src/routes/whatsapp.routes.js` exposes webhook POST aliases without auth; `whatsappWebhook.controller.js` parses Meta status receipts and updates `ShipmentNotificationLog` but does not validate Meta `X-Hub-Signature-256` against the raw request body. The GET verification path also accepts hardcoded fallback tokens and logs supplied verification tokens.

**Recommendation:** Require Meta app-secret HMAC verification for Meta payloads and a distinct shared secret/signature for remote-service callbacks; fail closed when secrets are missing. Remove hardcoded verification tokens and never log supplied tokens. Keep provider-specific callback verification separate.

### 4. Phone masking is inconsistent and breaks a resend path

**Priority:** P1
**Impact:** Chatwoot's event orchestrator creates logs with `recipientPhone: maskPhone(target.phone)`, but the admin resend endpoint passes the stored `recipientPhone` back to `sendNotification` as the destination. A masked value is not a usable phone number and may normalize to an incomplete number. The integration provider path stores unmasked phone values in `ShipmentNotificationLog`.

Evidence: `chatwootNotificationService.createLog`, `whatsappIntegration.service.js` log creation, and `adminWhatsAppLogs.controller.js::resendNotification`.

**Recommendation:** Keep a normalized delivery address in a protected encrypted/contact reference usable for retries, and a separate masked display field for routine UI. Resend should resolve the destination from a trusted shipment party/contact record and confirm it matches the logged recipient role. Do not treat a display mask as a send address.

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

**Local remediation:** Automatic shipper lifecycle notifications now request the user-confirmed `shipment_confirmation_2`. If the inbox returns a template list that does not include it, dispatch fails visibly instead of falling back to a generic template. The Chatwoot `content` field mirrors the approved template body and omits the separately generated Support link. Missing receiver fields use the agreed literal placeholders. This change has not been deployed or verified against production Chatwoot.

## Suggested order

1. Fix the live event-template fallback and receiver/recipient data contract; add provider-parity coverage.
2. Close the manual-send authorization gap and authenticate status callbacks.
3. Repair resend destination handling and reduce PII exposure.
4. Unify automatic recipient policy and effective configuration.
5. Normalize send/delivery states and consolidate queue ownership.
6. Keep the canonical guide, template catalog, and issue status current.

## Evidence limits

The exact approved Chatwoot copy, rendered body, and current per-message delivery/read status were supplied for 100 sampled messages. The source for `routes/webhook.js`, `routes/send.js`, `services/messageLog.js`, `services/autoSend.js`, and `services/whatsapp.js` was reviewed at `/root/projects/shipment-whatsapp` commit `b3d5630d019172be6417a5355bc3374f7355f380`. It shows a JSON-backed per-WAMID log with delivered/read/failed timestamps and error fields, but those exact service-side records were not supplied. The webhook source also exposes `/sync-receipt` without visible authentication and makes Meta signature checking conditional on a configured app secret, while skipping it for requests carrying `X-Forwarded-From`; runtime route/parser wiring and whether those settings are configured remain unverified. Remaining evidence is the service-side records for the two failed Chatwoot message IDs (or provider failure details), actual status timestamps, plus `index.js` route/parser wiring and safe config-presence/forward-target metadata. No test send is needed.
