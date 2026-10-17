-- Hardening migration
--   * money columns become exact NUMERIC(15,2) (were double precision)
--   * per-project tax / pricing settings
--   * session versioning, shared rate-limit counters, gap-free number sequences
--   * structured attachments on communication logs
--   * database-level guards: one active sale per unit, valid user roles, non-negative payments

-- ── Pre-flight: stop with a readable message instead of a cryptic index error ───────────────
DO $$
DECLARE dup text;
BEGIN
  SELECT string_agg(u."unitNumber", ', ') INTO dup
  FROM units u
  WHERE (SELECT count(*) FROM sales s WHERE s."unitId" = u.id AND s."deletedAt" IS NULL AND s.status <> 'CANCELLED') > 1;
  IF dup IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot apply: these units have more than one active sale: %. Cancel the extra sales (Sales > open the sale > Delete) and run the update again.', dup;
  END IF;
END $$;

-- AlterTable
ALTER TABLE "communication_logs" ADD COLUMN     "attachments" JSONB,
ADD COLUMN     "claimedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "inquiries" ALTER COLUMN "agreementValue" SET DATA TYPE DECIMAL(15,2),
ALTER COLUMN "stampDuty" SET DATA TYPE DECIMAL(15,2),
ALTER COLUMN "gst" SET DATA TYPE DECIMAL(15,2),
ALTER COLUMN "registration" SET DATA TYPE DECIMAL(15,2),
ALTER COLUMN "totalCost" SET DATA TYPE DECIMAL(15,2);

-- AlterTable
ALTER TABLE "loan_disbursements" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(15,2);

-- AlterTable
ALTER TABLE "loans" ALTER COLUMN "sanctionedAmount" SET DATA TYPE DECIMAL(15,2),
ALTER COLUMN "totalDisbursed" SET DATA TYPE DECIMAL(15,2);

-- AlterTable
ALTER TABLE "payment_schedules" ALTER COLUMN "principalAmount" SET DATA TYPE DECIMAL(15,2),
ALTER COLUMN "gstAmount" SET DATA TYPE DECIMAL(15,2),
ALTER COLUMN "interestAmount" SET DATA TYPE DECIMAL(15,2);

-- AlterTable
ALTER TABLE "payments" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(15,2),
ALTER COLUMN "gstPaid" SET DATA TYPE DECIMAL(15,2);

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "gstRatePercent" DOUBLE PRECISION NOT NULL DEFAULT 5,
ADD COLUMN     "interestRatePercent" DOUBLE PRECISION NOT NULL DEFAULT 12,
ADD COLUMN     "regChargesCap" DECIMAL(15,2) DEFAULT 30000,
ADD COLUMN     "regParkingCharges" DECIMAL(15,2) NOT NULL DEFAULT 20000,
ADD COLUMN     "tdsRatePercent" DOUBLE PRECISION NOT NULL DEFAULT 1,
ALTER COLUMN "stampDutyPercent" SET DEFAULT 6,
ALTER COLUMN "carParkingCharges" SET DATA TYPE DECIMAL(15,2);

-- AlterTable
ALTER TABLE "sales" ALTER COLUMN "agreementValue" SET DATA TYPE DECIMAL(15,2),
ALTER COLUMN "gstAmount" SET DATA TYPE DECIMAL(15,2),
ALTER COLUMN "stampDuty" SET DATA TYPE DECIMAL(15,2),
ALTER COLUMN "registrationCharges" SET DATA TYPE DECIMAL(15,2),
ALTER COLUMN "carParkingCharges" SET DATA TYPE DECIMAL(15,2),
ALTER COLUMN "bookingAmount" SET DATA TYPE DECIMAL(15,2);

-- AlterTable
ALTER TABLE "tds_records" ALTER COLUMN "tdsAmount" SET DATA TYPE DECIMAL(15,2);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "passwordChangedAt" TIMESTAMP(3),
ADD COLUMN     "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "number_sequences" (
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL,

    CONSTRAINT "number_sequences_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "rate_limits" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "resetAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "rate_limits_resetAt_idx" ON "rate_limits"("resetAt");


-- ── Data fixes ──────────────────────────────────────────────────────────────────────────────
-- The stamp-duty column existed but was never used (the sale form hard-coded 6%). Projects still on the old
-- default of 5 move to 6 so quotes keep producing the same numbers; any value someone set by hand is kept.
UPDATE "projects" SET "stampDutyPercent" = 6 WHERE "stampDutyPercent" = 5;

-- Roles that the application never understood (SALES_MANAGER, ACCOUNTS, MANAGEMENT...) could not write anything,
-- so they were de-facto read-only. Make that explicit instead of leaving a free-text value.
UPDATE "users" SET "role" = 'VIEWER' WHERE "role" NOT IN ('SUPER_ADMIN', 'ADMIN', 'SALES', 'VIEWER');

-- ── Guards ──────────────────────────────────────────────────────────────────────────────────
-- A unit can have at most one live sale (cancelled and soft-deleted sales do not count).
CREATE UNIQUE INDEX "sales_one_active_per_unit" ON "sales"("unitId") WHERE "deletedAt" IS NULL AND "status" <> 'CANCELLED';

ALTER TABLE "users" ADD CONSTRAINT "users_role_check" CHECK ("role" IN ('SUPER_ADMIN', 'ADMIN', 'SALES', 'VIEWER'));
ALTER TABLE "payments" ADD CONSTRAINT "payments_amounts_check" CHECK ("amount" >= 0 AND "gstPaid" >= 0);
ALTER TABLE "payment_schedules" ADD CONSTRAINT "payment_schedules_amounts_check" CHECK ("principalAmount" >= 0 AND "gstAmount" >= 0 AND "interestAmount" >= 0);

CREATE INDEX "payment_schedules_status_dueDate_idx" ON "payment_schedules"("status", "dueDate");
CREATE INDEX "communication_logs_status_retryCount_idx" ON "communication_logs"("status", "retryCount");
