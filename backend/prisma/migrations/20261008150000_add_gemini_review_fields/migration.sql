ALTER TABLE `GeminiClassificationLog`
  ADD COLUMN `reviewedBy` VARCHAR(191) NULL,
  ADD COLUMN `reviewedAt` DATETIME(3) NULL,
  ADD COLUMN `reviewNote` TEXT NULL;
