-- Migration: 20261017_whatsapp_chatwoot_config
-- Description: Add WhatsAppConfig, WhatsAppEventRule, Chatwoot user mapping, and shipment locationToken for customer GPS portal
-- Engine: MySQL (with PostgreSQL compatible DDL documentation)

-- ========================================
-- 1. WHATSAPP CONFIGURATION TABLE
-- ========================================
CREATE TABLE `WhatsAppConfig` (
    `id` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(191) NOT NULL DEFAULT 'SHIPMENT_WHATSAPP',
    `serviceUrl` VARCHAR(191) NOT NULL DEFAULT 'https://msg.target-kw.com',
    `apiKey` VARCHAR(191) NULL,
    `phoneId` VARCHAR(191) NULL,
    `chatwootBaseUrl` VARCHAR(191) NOT NULL DEFAULT 'https://inbox.mawthook.io',
    `chatwootAccountId` VARCHAR(191) NOT NULL DEFAULT '1',
    `chatwootInboxId` VARCHAR(191) NULL,
    `chatwootApiToken` VARCHAR(191) NULL,
    `quietHoursEnabled` BOOLEAN NOT NULL DEFAULT false,
    `quietHoursStart` VARCHAR(191) NOT NULL DEFAULT '22:00',
    `quietHoursEnd` VARCHAR(191) NOT NULL DEFAULT '08:00',
    `quietHoursTimezone` VARCHAR(191) NOT NULL DEFAULT 'Asia/Kuwait',
    `allowDeliveryQuietHours` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ========================================
-- 2. WHATSAPP EVENT RULES TABLE
-- ========================================
CREATE TABLE `WhatsAppEventRule` (
    `id` VARCHAR(191) NOT NULL,
    `configId` VARCHAR(191) NOT NULL,
    `eventType` VARCHAR(191) NOT NULL,
    `recipientRole` VARCHAR(191) NOT NULL,
    `templateName` VARCHAR(191) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `allowQuietHoursBypass` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `WhatsAppEventRule_configId_eventType_recipientRole_key`(`configId`, `eventType`, `recipientRole`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Add Foreign Key for WhatsAppEventRule -> WhatsAppConfig
ALTER TABLE `WhatsAppEventRule` ADD CONSTRAINT `WhatsAppEventRule_configId_fkey` FOREIGN KEY (`configId`) REFERENCES `WhatsAppConfig`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- ========================================
-- 3. USER CHATWOOT IDENTITY FIELDS
-- ========================================
ALTER TABLE `User` 
    ADD COLUMN `chatwootUserId` VARCHAR(191) NULL,
    ADD COLUMN `chatwootEmail` VARCHAR(191) NULL;

-- ========================================
-- 4. SHIPMENT LOCATION TOKEN FIELDS
-- ========================================
ALTER TABLE `Shipment` 
    ADD COLUMN `locationToken` VARCHAR(191) NULL,
    ADD COLUMN `locationTokenExpiresAt` DATETIME(3) NULL;

CREATE UNIQUE INDEX `Shipment_locationToken_key` ON `Shipment`(`locationToken`);

/*
-- ========================================
-- POSTGRESQL EQUIVALENT DDL REFERENCE:
-- ========================================

CREATE TABLE "WhatsAppConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL DEFAULT 'SHIPMENT_WHATSAPP',
    "serviceUrl" TEXT NOT NULL DEFAULT 'https://msg.target-kw.com',
    "apiKey" TEXT,
    "phoneId" TEXT,
    "chatwootBaseUrl" TEXT NOT NULL DEFAULT 'https://inbox.mawthook.io',
    "chatwootAccountId" TEXT NOT NULL DEFAULT '1',
    "chatwootInboxId" TEXT,
    "chatwootApiToken" TEXT,
    "quietHoursEnabled" BOOLEAN NOT NULL DEFAULT false,
    "quietHoursStart" TEXT NOT NULL DEFAULT '22:00',
    "quietHoursEnd" TEXT NOT NULL DEFAULT '08:00',
    "quietHoursTimezone" TEXT NOT NULL DEFAULT 'Asia/Kuwait',
    "allowDeliveryQuietHours" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "WhatsAppEventRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "configId" TEXT NOT NULL REFERENCES "WhatsAppConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "eventType" TEXT NOT NULL,
    "recipientRole" TEXT NOT NULL,
    "templateName" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "allowQuietHoursBypass" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WhatsAppEventRule_config_event_recipient_unique" UNIQUE ("configId", "eventType", "recipientRole")
);

ALTER TABLE "User" 
    ADD COLUMN "chatwootUserId" TEXT,
    ADD COLUMN "chatwootEmail" TEXT;

ALTER TABLE "Shipment" 
    ADD COLUMN "locationToken" TEXT,
    ADD COLUMN "locationTokenExpiresAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Shipment_locationToken_key" ON "Shipment"("locationToken");
*/
