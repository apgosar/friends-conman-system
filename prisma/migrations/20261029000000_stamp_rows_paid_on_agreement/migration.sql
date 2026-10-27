-- Stamp duty and registration are collected outside the application and count as paid once the agreement date is recorded.
-- Sales whose agreement was already signed get that now; from here on it follows the agreement date (lib/sale-lifecycle.ts).
UPDATE "payment_schedules"
SET "status" = 'PAID', "updatedAt" = NOW()
WHERE "status" <> 'PAID'
  AND "description" ~* 'stamp duty|registration'
  AND "saleId" IN (SELECT "id" FROM "sales" WHERE "agreementDate" IS NOT NULL);
