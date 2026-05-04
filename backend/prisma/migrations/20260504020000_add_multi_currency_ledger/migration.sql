ALTER TABLE `OrganizationLedger`
  ADD COLUMN `currency` VARCHAR(191) NOT NULL DEFAULT 'KWD';

ALTER TABLE `PaymentAllocation`
  ADD COLUMN `currency` VARCHAR(191) NOT NULL DEFAULT 'KWD';

UPDATE `OrganizationLedger`
SET `currency` = UPPER(SUBSTRING(COALESCE(
  JSON_UNQUOTE(JSON_EXTRACT(`metadata`, '$.currency')),
  JSON_UNQUOTE(JSON_EXTRACT(`metadata`, '$.billingCurrency')),
  JSON_UNQUOTE(JSON_EXTRACT(`metadata`, '$.declaredCurrency')),
  'KWD'
), 1, 3));

UPDATE `PaymentAllocation` pa
INNER JOIN `Payment` p ON p.`id` = pa.`paymentId`
SET pa.`currency` = UPPER(SUBSTRING(COALESCE(p.`currency`, 'KWD'), 1, 3));

CREATE INDEX `Ledger_org_currency_created_idx`
  ON `OrganizationLedger`(`organizationId`, `currency`, `createdAt`);

CREATE INDEX `Allocation_org_currency_status_idx`
  ON `PaymentAllocation`(`organizationId`, `currency`, `status`);
