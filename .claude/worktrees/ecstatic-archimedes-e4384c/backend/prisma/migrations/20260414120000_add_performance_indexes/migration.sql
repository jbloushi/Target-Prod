-- Add business-path indexes for shipment lists, finance dashboards, API access,
-- pickup workflows, webhook dispatch, carrier logs, and audit lookups.

CREATE INDEX `User_org_role_active_idx` ON `User`(`organizationId`, `role`, `active`);
CREATE INDEX `User_role_active_idx` ON `User`(`role`, `active`);

CREATE INDEX `Shipment_user_status_created_idx` ON `Shipment`(`userId`, `status`, `createdAt`);
CREATE INDEX `Shipment_org_status_created_idx` ON `Shipment`(`organizationId`, `status`, `createdAt`);
CREATE INDEX `Shipment_org_paid_created_idx` ON `Shipment`(`organizationId`, `paid`, `createdAt`);
CREATE INDEX `Shipment_driver_status_created_idx` ON `Shipment`(`assignedDriverId`, `status`, `createdAt`);
CREATE INDEX `Shipment_carrier_service_idx` ON `Shipment`(`carrierCode`, `serviceCode`);
CREATE INDEX `Shipment_createdAt_idx` ON `Shipment`(`createdAt`);
CREATE INDEX `Shipment_updatedAt_idx` ON `Shipment`(`updatedAt`);

CREATE INDEX `Ledger_org_created_idx` ON `OrganizationLedger`(`organizationId`, `createdAt`);
CREATE INDEX `Ledger_org_entryType_idx` ON `OrganizationLedger`(`organizationId`, `entryType`);
CREATE INDEX `Ledger_source_idx` ON `OrganizationLedger`(`sourceRepo`, `sourceId`);
CREATE INDEX `Ledger_reference_idx` ON `OrganizationLedger`(`reference`);

CREATE INDEX `Payment_org_status_posted_idx` ON `Payment`(`organizationId`, `status`, `postedAt`);
CREATE INDEX `Payment_createdBy_posted_idx` ON `Payment`(`createdById`, `postedAt`);
CREATE INDEX `Payment_reference_idx` ON `Payment`(`reference`);

CREATE INDEX `Allocation_shipment_status_idx` ON `PaymentAllocation`(`shipmentId`, `status`);
CREATE INDEX `Allocation_payment_status_idx` ON `PaymentAllocation`(`paymentId`, `status`);
CREATE INDEX `Allocation_org_status_created_idx` ON `PaymentAllocation`(`organizationId`, `status`, `createdAt`);
CREATE INDEX `Allocation_createdBy_created_idx` ON `PaymentAllocation`(`createdBy`, `createdAt`);

CREATE INDEX `WebhookSubscription_org_active_idx` ON `WebhookSubscription`(`organizationId`, `isActive`);
CREATE INDEX `WebhookEvent_subscription_status_created_idx` ON `WebhookEvent`(`subscriptionId`, `status`, `createdAt`);

CREATE INDEX `Pickup_org_status_created_idx` ON `PickupRequest`(`organizationId`, `status`, `createdAt`);
CREATE INDEX `Pickup_user_status_created_idx` ON `PickupRequest`(`userId`, `status`, `createdAt`);
CREATE INDEX `Pickup_driver_status_created_idx` ON `PickupRequest`(`assignedDriverId`, `status`, `createdAt`);
CREATE INDEX `Pickup_shipment_idx` ON `PickupRequest`(`shipmentId`);

CREATE INDEX `CarrierLog_carrier_request_created_idx` ON `CarrierLog`(`carrierCode`, `requestType`, `createdAt`);
CREATE INDEX `CarrierLog_tracking_idx` ON `CarrierLog`(`trackingNumber`);
CREATE INDEX `CarrierLog_org_created_idx` ON `CarrierLog`(`organizationId`, `createdAt`);

CREATE INDEX `SystemAuditLog_user_created_idx` ON `SystemAuditLog`(`userId`, `createdAt`);
CREATE INDEX `SystemAuditLog_resource_created_idx` ON `SystemAuditLog`(`resource`, `resourceId`, `createdAt`);
