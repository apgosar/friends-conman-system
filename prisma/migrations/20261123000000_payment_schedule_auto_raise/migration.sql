-- Date-based payment plans: a demand raised and sent on a date of the plan instead of when a construction milestone is completed.
-- "raiseOn" is that date; "autoRaise" marks the rows the daily job raises. Existing demands are unchanged.
ALTER TABLE "payment_schedules" ADD COLUMN "raiseOn" TIMESTAMP(3);
ALTER TABLE "payment_schedules" ADD COLUMN "autoRaise" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "payment_schedules_autoRaise_raiseOn_idx" ON "payment_schedules"("autoRaise", "raiseOn");
