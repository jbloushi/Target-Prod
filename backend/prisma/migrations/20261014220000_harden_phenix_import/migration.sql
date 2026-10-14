ALTER TABLE `Shipment`
  ADD COLUMN `phenixSourceKey` VARCHAR(191) NULL;

CREATE UNIQUE INDEX `Shipment_phenixSourceKey_key` ON `Shipment`(`phenixSourceKey`);

CREATE TABLE `PhenixImportRun` (
  `id` VARCHAR(191) NOT NULL,
  `windowFrom` DATETIME(3) NOT NULL,
  `windowTo` DATETIME(3) NOT NULL,
  `carrierFilter` VARCHAR(191) NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'RUNNING',
  `triggeredBy` VARCHAR(191) NULL,
  `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `finishedAt` DATETIME(3) NULL,
  `totalFetched` INTEGER NOT NULL DEFAULT 0,
  `matchedCount` INTEGER NOT NULL DEFAULT 0,
  `completeCount` INTEGER NOT NULL DEFAULT 0,
  `skippedCount` INTEGER NOT NULL DEFAULT 0,
  `createdCount` INTEGER NOT NULL DEFAULT 0,
  `updatedCount` INTEGER NOT NULL DEFAULT 0,
  `errorCount` INTEGER NOT NULL DEFAULT 0,
  `summary` JSON NULL,
  `errorMessage` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `PhenixImportRun_status_started_idx` (`status`, `startedAt`),
  INDEX `PhenixImportRun_window_idx` (`windowFrom`, `windowTo`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PhenixImportItem` (
  `id` VARCHAR(191) NOT NULL,
  `runId` VARCHAR(191) NOT NULL,
  `sourceKey` VARCHAR(191) NOT NULL,
  `billId` VARCHAR(191) NULL,
  `receiptNo` VARCHAR(191) NULL,
  `carrierTracking` VARCHAR(191) NULL,
  `derivedCarrier` VARCHAR(191) NULL,
  `rawDestination` VARCHAR(191) NULL,
  `resolvedDestination` VARCHAR(191) NULL,
  `phoneCountry` VARCHAR(191) NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
  `shipmentId` VARCHAR(191) NULL,
  `errorMessage` TEXT NULL,
  `rawRow` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `PhenixImportItem_run_source_key_uq` (`runId`, `sourceKey`),
  INDEX `PhenixImportItem_source_key_idx` (`sourceKey`),
  INDEX `PhenixImportItem_status_created_idx` (`status`, `createdAt`),
  INDEX `PhenixImportItem_shipment_idx` (`shipmentId`),
  CONSTRAINT `PhenixImportItem_runId_fkey` FOREIGN KEY (`runId`) REFERENCES `PhenixImportRun` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `PhenixImportItem_shipmentId_fkey` FOREIGN KEY (`shipmentId`) REFERENCES `Shipment` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PhenixImportLease` (
  `lockKey` VARCHAR(191) NOT NULL,
  `ownerId` VARCHAR(191) NOT NULL,
  `lockedUntil` DATETIME(3) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`lockKey`),
  INDEX `PhenixImportLease_locked_until_idx` (`lockedUntil`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
