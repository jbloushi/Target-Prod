CREATE TABLE `UserAccessScope` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `organizationId` VARCHAR(191) NULL,
  `clientUserId` VARCHAR(191) NULL,
  `scopeType` ENUM('COMPANY_ALL_USERS', 'CLIENT_USER') NOT NULL,
  `canCreateOnBehalf` BOOLEAN NOT NULL DEFAULT false,
  `canViewShipments` BOOLEAN NOT NULL DEFAULT true,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `UserAccessScope_user_active_idx` (`userId`, `active`),
  INDEX `UserAccessScope_org_active_idx` (`organizationId`, `active`),
  INDEX `UserAccessScope_client_active_idx` (`clientUserId`, `active`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `UserAccessScope`
  ADD CONSTRAINT `UserAccessScope_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `UserAccessScope`
  ADD CONSTRAINT `UserAccessScope_organizationId_fkey`
  FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `UserAccessScope`
  ADD CONSTRAINT `UserAccessScope_clientUserId_fkey`
  FOREIGN KEY (`clientUserId`) REFERENCES `User`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
