CREATE TABLE IF NOT EXISTS `Invoice` (
  `id` VARCHAR(191) NOT NULL,
  `organizationId` VARCHAR(191) NULL,
  `invoiceNumber` VARCHAR(191) NOT NULL,
  `periodStart` DATETIME(3) NOT NULL,
  `periodEnd` DATETIME(3) NOT NULL,
  `subtotal` DECIMAL(18, 4) NOT NULL,
  `vat` DECIMAL(18, 4) NOT NULL DEFAULT 0.0,
  `total` DECIMAL(18, 4) NOT NULL,
  `currency` VARCHAR(191) NOT NULL DEFAULT 'KWD',
  `status` VARCHAR(191) NOT NULL DEFAULT 'draft',
  `dueDate` DATETIME(3) NULL,
  `sentAt` DATETIME(3) NULL,
  `paidAt` DATETIME(3) NULL,
  `notes` TEXT NULL,
  `createdById` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `Invoice_invoiceNumber_key` (`invoiceNumber`),
  INDEX `Invoice_org_status_created_idx` (`organizationId`, `status`, `createdAt`),
  INDEX `Invoice_period_idx` (`periodStart`, `periodEnd`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `InvoiceLine` (
  `id` VARCHAR(191) NOT NULL,
  `invoiceId` VARCHAR(191) NOT NULL,
  `shipmentId` VARCHAR(191) NOT NULL,
  `ledgerEntryId` VARCHAR(191) NOT NULL,
  `trackingNumber` VARCHAR(191) NOT NULL,
  `shipmentDate` DATETIME(3) NULL,
  `amount` DECIMAL(18, 4) NOT NULL,
  `currency` VARCHAR(191) NOT NULL DEFAULT 'KWD',
  `paid` BOOLEAN NOT NULL DEFAULT false,
  `totalPaid` DECIMAL(18, 4) NOT NULL DEFAULT 0.0,
  `remainingBalance` DECIMAL(18, 4) NOT NULL DEFAULT 0.0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `InvoiceLine_ledgerEntryId_key` (`ledgerEntryId`),
  INDEX `InvoiceLine_invoice_idx` (`invoiceId`),
  INDEX `InvoiceLine_shipment_idx` (`shipmentId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
