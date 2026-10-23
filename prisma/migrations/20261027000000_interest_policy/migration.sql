-- Interest on late demands: configurable per project, accrued daily into a ledger, payable with a payment, waivable.
ALTER TABLE "projects" ADD COLUMN "interestEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "projects" ADD COLUMN "interestGraceDays" INTEGER NOT NULL DEFAULT 7;
ALTER TABLE "projects" ADD COLUMN "interestDefaultOrder" TEXT NOT NULL DEFAULT 'INTEREST_FIRST';
ALTER TABLE "projects" ADD COLUMN "interestOnDemand" TEXT NOT NULL DEFAULT 'WHEN_ACCRUED';

ALTER TABLE "payments" ADD COLUMN "interestPaid" DECIMAL(15,2) NOT NULL DEFAULT 0;

CREATE TABLE "interest_accruals" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "principalBase" DECIMAL(15,2) NOT NULL,
    "ratePercent" DOUBLE PRECISION NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,

    CONSTRAINT "interest_accruals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "interest_accruals_scheduleId_date_key" ON "interest_accruals"("scheduleId", "date");

ALTER TABLE "interest_accruals" ADD CONSTRAINT "interest_accruals_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "payment_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "interest_waivers" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interest_waivers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "interest_waivers_scheduleId_idx" ON "interest_waivers"("scheduleId");

ALTER TABLE "interest_waivers" ADD CONSTRAINT "interest_waivers_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "payment_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
