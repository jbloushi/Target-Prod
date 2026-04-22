-- AddColumns failedLoginAttempts and lockedUntil to User (F-13 login brute-force protection)
ALTER TABLE "User" ADD COLUMN "failedLoginAttempts" INT NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "lockedUntil" DATETIME(3) NULL;
