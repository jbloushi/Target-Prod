-- Migration: 20261024_chatwoot_single_channel_identity
-- Description: Add chatwootAccessToken (AES-256-GCM encrypted envelope) to User, fallbackProvider & enabled to WhatsAppConfig, isFallback to ShipmentNotificationLog, and chatwootOrganizationId to Organization.
-- Target Engine: MySQL 8.0+ (InnoDB)
-- Safety: INSTANT DDL operations. Zero table locks, zero downtime, zero data loss.

-- 1. Alter User table
ALTER TABLE `User` 
    ADD COLUMN `chatwootAccessToken` TEXT NULL;

-- 2. Alter WhatsAppConfig table
ALTER TABLE `WhatsAppConfig` 
    ADD COLUMN `enabled` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `fallbackProvider` VARCHAR(191) NOT NULL DEFAULT 'SHIPMENT_WHATSAPP';

-- 3. Alter Organization table
ALTER TABLE `Organization` 
    ADD COLUMN `chatwootOrganizationId` VARCHAR(191) NULL;

-- 4. Alter ShipmentNotificationLog table
ALTER TABLE `ShipmentNotificationLog` 
    ADD COLUMN `isFallback` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `fallbackReason` TEXT NULL;

-- 5. Add index for fallback telemetry queries
CREATE INDEX `ShipmentNotification_fallback_created_idx` 
    ON `ShipmentNotificationLog`(`isFallback`, `createdAt`);
