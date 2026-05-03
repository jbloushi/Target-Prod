ALTER TABLE `Shipment`
  ADD COLUMN `createdOnBehalfOfUserId` VARCHAR(191) NULL;

CREATE INDEX `Shipment_on_behalf_created_idx`
  ON `Shipment`(`createdOnBehalfOfUserId`, `createdAt`);
