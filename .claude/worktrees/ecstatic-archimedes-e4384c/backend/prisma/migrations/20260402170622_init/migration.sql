-- CreateTable
CREATE TABLE `Organization` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL DEFAULT 'BUSINESS',
    `taxId` VARCHAR(191) NULL,
    `balance` DECIMAL(18, 4) NOT NULL DEFAULT 0.0,
    `creditLimit` DECIMAL(18, 4) NOT NULL DEFAULT 0.0,
    `unappliedBalance` DECIMAL(18, 4) NOT NULL DEFAULT 0.0,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'KWD',
    `markup` JSON NULL,
    `allowedCarriers` JSON NULL,
    `addresses` JSON NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Organization_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NULL,
    `role` ENUM('staff', 'admin', 'driver', 'accounting', 'manager', 'org_manager', 'org_agent', 'client') NOT NULL DEFAULT 'org_agent',
    `password` VARCHAR(191) NOT NULL,
    `carrierConfig` JSON NULL,
    `agentPolicy` JSON NULL,
    `addresses` JSON NULL,
    `otp` JSON NULL,
    `apiKeyHash` VARCHAR(191) NULL,
    `apiKeyLast4` VARCHAR(191) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    UNIQUE INDEX `User_phone_key`(`phone`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Shipment` (
    `id` VARCHAR(191) NOT NULL,
    `trackingNumber` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NULL,
    `assignedStaffId` VARCHAR(191) NULL,
    `assignedDriverId` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'draft',
    `estimatedDelivery` DATETIME(3) NULL,
    `carrierCode` VARCHAR(191) NOT NULL DEFAULT 'DGR',
    `serviceCode` VARCHAR(191) NULL,
    `shipmentType` VARCHAR(191) NOT NULL DEFAULT 'package',
    `price` DECIMAL(18, 4) NULL,
    `costPrice` DECIMAL(18, 4) NULL,
    `markupAmount` DECIMAL(18, 4) NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'KWD',
    `paid` BOOLEAN NOT NULL DEFAULT false,
    `totalPaid` DECIMAL(18, 4) NOT NULL DEFAULT 0.0,
    `remainingBalance` DECIMAL(18, 4) NOT NULL DEFAULT 0.0,
    `origin` JSON NOT NULL,
    `destination` JSON NOT NULL,
    `currentLocation` JSON NULL,
    `checkpoints` JSON NULL,
    `history` JSON NULL,
    `parcels` JSON NULL,
    `items` JSON NULL,
    `pricingSnapshot` JSON NULL,
    `bookingAttempts` JSON NULL,
    `documents` JSON NULL,
    `financeHold` JSON NULL,
    `dhlTrackingNumber` VARCHAR(191) NULL,
    `dhlConfirmed` BOOLEAN NOT NULL DEFAULT false,
    `carrierShipmentId` VARCHAR(191) NULL,
    `labelUrl` VARCHAR(191) NULL,
    `awbUrl` VARCHAR(191) NULL,
    `invoiceUrl` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Shipment_trackingNumber_key`(`trackingNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OrganizationLedger` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NULL,
    `amount` DECIMAL(18, 4) NOT NULL,
    `entryType` ENUM('DEBIT', 'CREDIT') NOT NULL,
    `category` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NOT NULL,
    `reference` VARCHAR(191) NULL,
    `sourceRepo` VARCHAR(191) NULL,
    `sourceId` VARCHAR(191) NULL,
    `parentEntryId` VARCHAR(191) NULL,
    `balanceAfter` DECIMAL(18, 4) NOT NULL,
    `createdBy` VARCHAR(191) NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Payment` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NULL,
    `amount` DECIMAL(18, 4) NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'KWD',
    `status` VARCHAR(191) NOT NULL DEFAULT 'UNAPPLIED',
    `method` VARCHAR(191) NOT NULL DEFAULT 'manual',
    `reference` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `createdById` VARCHAR(191) NULL,
    `metadata` JSON NULL,
    `postedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PaymentAllocation` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NULL,
    `paymentId` VARCHAR(191) NOT NULL,
    `shipmentId` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(18, 4) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `isFifo` BOOLEAN NOT NULL DEFAULT false,
    `createdBy` VARCHAR(191) NULL,
    `reversedAt` DATETIME(3) NULL,
    `reversedBy` VARCHAR(191) NULL,
    `reversalReason` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WebhookSubscription` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `targetUrl` VARCHAR(191) NOT NULL,
    `secret` VARCHAR(191) NOT NULL,
    `events` JSON NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WebhookEvent` (
    `id` VARCHAR(191) NOT NULL,
    `subscriptionId` VARCHAR(191) NOT NULL,
    `event` VARCHAR(191) NOT NULL,
    `payload` JSON NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `lastAttemptAt` DATETIME(3) NULL,
    `lastError` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PickupRequest` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NOT NULL,
    `shipmentId` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `pickupLocation` JSON NOT NULL,
    `pickupTime` DATETIME(3) NULL,
    `assignedDriverId` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CarrierLog` (
    `id` VARCHAR(191) NOT NULL,
    `carrierCode` VARCHAR(191) NOT NULL,
    `requestType` VARCHAR(191) NOT NULL,
    `requestPayload` JSON NOT NULL,
    `responsePayload` JSON NULL,
    `statusCode` INTEGER NULL,
    `durationMs` INTEGER NULL,
    `trackingNumber` VARCHAR(191) NULL,
    `organizationId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SystemAuditLog` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `action` VARCHAR(191) NOT NULL,
    `resource` VARCHAR(191) NOT NULL,
    `resourceId` VARCHAR(191) NULL,
    `oldValues` JSON NULL,
    `newValues` JSON NULL,
    `ipAddress` VARCHAR(191) NULL,
    `userAgent` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Shipment` ADD CONSTRAINT `Shipment_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Shipment` ADD CONSTRAINT `Shipment_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Shipment` ADD CONSTRAINT `Shipment_assignedStaffId_fkey` FOREIGN KEY (`assignedStaffId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Shipment` ADD CONSTRAINT `Shipment_assignedDriverId_fkey` FOREIGN KEY (`assignedDriverId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrganizationLedger` ADD CONSTRAINT `OrganizationLedger_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentAllocation` ADD CONSTRAINT `PaymentAllocation_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentAllocation` ADD CONSTRAINT `PaymentAllocation_paymentId_fkey` FOREIGN KEY (`paymentId`) REFERENCES `Payment`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentAllocation` ADD CONSTRAINT `PaymentAllocation_shipmentId_fkey` FOREIGN KEY (`shipmentId`) REFERENCES `Shipment`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentAllocation` ADD CONSTRAINT `PaymentAllocation_createdBy_fkey` FOREIGN KEY (`createdBy`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WebhookSubscription` ADD CONSTRAINT `WebhookSubscription_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WebhookEvent` ADD CONSTRAINT `WebhookEvent_subscriptionId_fkey` FOREIGN KEY (`subscriptionId`) REFERENCES `WebhookSubscription`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PickupRequest` ADD CONSTRAINT `PickupRequest_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PickupRequest` ADD CONSTRAINT `PickupRequest_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PickupRequest` ADD CONSTRAINT `PickupRequest_shipmentId_fkey` FOREIGN KEY (`shipmentId`) REFERENCES `Shipment`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PickupRequest` ADD CONSTRAINT `PickupRequest_assignedDriverId_fkey` FOREIGN KEY (`assignedDriverId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SystemAuditLog` ADD CONSTRAINT `SystemAuditLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
