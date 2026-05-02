CREATE TABLE `ShipmentNotificationLog` (
    `id` VARCHAR(191) NOT NULL,
    `shipmentId` VARCHAR(191) NOT NULL,
    `trackingNumber` VARCHAR(191) NOT NULL,
    `eventType` VARCHAR(191) NOT NULL,
    `recipientRole` VARCHAR(191) NOT NULL,
    `recipientName` VARCHAR(191) NULL,
    `recipientPhone` VARCHAR(191) NULL,
    `provider` VARCHAR(191) NOT NULL DEFAULT 'chatwoot',
    `chatwootAccountId` VARCHAR(191) NULL,
    `chatwootInboxId` VARCHAR(191) NULL,
    `chatwootContactId` VARCHAR(191) NULL,
    `chatwootConversationId` VARCHAR(191) NULL,
    `templateName` VARCHAR(191) NULL,
    `payloadJson` JSON NULL,
    `responseJson` JSON NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `errorMessage` TEXT NULL,
    `sentAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ShipmentNotification_unique_event`(`shipmentId`, `eventType`, `recipientRole`, `provider`),
    INDEX `ShipmentNotification_tracking_idx`(`trackingNumber`),
    INDEX `ShipmentNotification_event_status_created_idx`(`eventType`, `status`, `createdAt`),
    INDEX `ShipmentNotification_provider_status_created_idx`(`provider`, `status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ShipmentNotificationLog` ADD CONSTRAINT `ShipmentNotificationLog_shipmentId_fkey` FOREIGN KEY (`shipmentId`) REFERENCES `Shipment`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
