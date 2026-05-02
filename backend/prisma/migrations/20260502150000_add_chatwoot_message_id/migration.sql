-- Add chatwootMessageId to ShipmentNotificationLog
-- Used by the Chatwoot webhook handler to match incoming status updates
-- (delivered/read/failed) back to the log entry for that message.

ALTER TABLE `ShipmentNotificationLog`
  ADD COLUMN `chatwootMessageId` VARCHAR(191) NULL AFTER `chatwootConversationId`;

CREATE INDEX `ShipmentNotification_chatwoot_msg_idx`
  ON `ShipmentNotificationLog` (`chatwootMessageId`);
