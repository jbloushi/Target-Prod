-- ShipmentNotificationLog is an attempt log, so multiple rows may exist for
-- the same shipment/event/role/provider. A stable dispatchKey protects only
-- the same intended recipient/template from concurrent or repeated dispatch.
-- Ensure the standalone shipmentId foreign-key index exists before removing
-- the legacy composite unique index. Reuse the standalone index if present.
SET @has_shipment_id_index = (
    SELECT COUNT(*)
    FROM (
        SELECT INDEX_NAME
        FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'ShipmentNotificationLog'
        GROUP BY INDEX_NAME
        HAVING COUNT(*) = 1
          AND MAX(CASE WHEN SEQ_IN_INDEX = 1 AND COLUMN_NAME = 'shipmentId' THEN 1 ELSE 0 END) = 1
    ) AS standalone_shipment_id_indexes
);
SET @sql = IF(
    @has_shipment_id_index = 0,
    'CREATE INDEX `ShipmentNotificationLog_shipmentId_fkey` ON `ShipmentNotificationLog` (`shipmentId`)',
    'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_legacy_event_unique = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'ShipmentNotificationLog'
      AND INDEX_NAME = 'ShipmentNotification_unique_event'
);
SET @sql = IF(
    @has_legacy_event_unique > 0,
    'ALTER TABLE `ShipmentNotificationLog` DROP INDEX `ShipmentNotification_unique_event`',
    'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_dispatch_key_column = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'ShipmentNotificationLog'
      AND COLUMN_NAME = 'dispatchKey'
);
SET @sql = IF(
    @has_dispatch_key_column = 0,
    'ALTER TABLE `ShipmentNotificationLog` ADD COLUMN `dispatchKey` VARCHAR(191) NULL',
    'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_dispatch_key_unique = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'ShipmentNotificationLog'
      AND INDEX_NAME = 'ShipmentNotificationLog_dispatchKey_key'
);
SET @sql = IF(
    @has_dispatch_key_unique = 0,
    'CREATE UNIQUE INDEX `ShipmentNotificationLog_dispatchKey_key` ON `ShipmentNotificationLog` (`dispatchKey`)',
    'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
