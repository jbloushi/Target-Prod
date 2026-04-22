-- AddColumn deletedAt to Shipment (soft delete support for F-10)
ALTER TABLE "Shipment" ADD COLUMN "deletedAt" DATETIME(3) NULL;
