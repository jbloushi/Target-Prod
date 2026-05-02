-- Compatibility for databases that already had an older ShipmentNotificationLog table.
-- Fresh databases created by 20260502120000_add_shipment_notification_logs do not have
-- these legacy columns, so each change is guarded by INFORMATION_SCHEMA.

SET @has_messageType = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'ShipmentNotificationLog'
      AND COLUMN_NAME = 'messageType'
);
SET @sql = IF(
    @has_messageType > 0,
    'ALTER TABLE `ShipmentNotificationLog` MODIFY `messageType` VARCHAR(191) NOT NULL DEFAULT ''shipment_operational''',
    'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_recipientSide = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'ShipmentNotificationLog'
      AND COLUMN_NAME = 'recipientSide'
);
SET @sql = IF(
    @has_recipientSide > 0,
    'ALTER TABLE `ShipmentNotificationLog` MODIFY `recipientSide` VARCHAR(191) NOT NULL DEFAULT ''''',
    'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_phone = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'ShipmentNotificationLog'
      AND COLUMN_NAME = 'phone'
);
SET @sql = IF(
    @has_phone > 0,
    'ALTER TABLE `ShipmentNotificationLog` MODIFY `phone` VARCHAR(191) NOT NULL DEFAULT ''''',
    'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_triggerSource = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'ShipmentNotificationLog'
      AND COLUMN_NAME = 'triggerSource'
);
SET @sql = IF(
    @has_triggerSource > 0,
    'ALTER TABLE `ShipmentNotificationLog` MODIFY `triggerSource` VARCHAR(191) NOT NULL DEFAULT ''manual''',
    'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
