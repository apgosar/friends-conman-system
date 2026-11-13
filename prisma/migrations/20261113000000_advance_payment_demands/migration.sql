-- A demand paid in part in advance (before its milestone was completed) used to become "Partially Paid" without ever being
-- raised: completing the milestone then skipped it, so its balance got no demand letter, due date, interest or reminders.
-- From now on such a demand stays "Upcoming" until its milestone is completed (see statusAfterPayment). This puts the
-- existing ones right.

-- 1. The milestone is not complete yet: back to Upcoming. Nothing on it is owed yet; completing the milestone bills the balance.
UPDATE "payment_schedules" AS ps
   SET "status" = 'UPCOMING'
  FROM "construction_milestones" AS m
 WHERE ps."milestoneId" = m."id"
   AND ps."status" = 'PARTIALLY_PAID'
   AND ps."demandGeneratedDate" IS NULL
   AND m."status" <> 'COMPLETED';

-- 2. The milestone has been completed since: raise the balance today, due in 14 days (DEMAND_DUE_DAYS), so no interest is
-- charged for the days it was never billed. No demand letter is sent from here (generate one on the sale's Documents page
-- if the buyer needs it); the weekly payment reminders pick it up from 7 days after today.
UPDATE "payment_schedules" AS ps
   SET "demandGeneratedDate" = now(),
       "dueDate" = now() + interval '14 days'
  FROM "construction_milestones" AS m
 WHERE ps."milestoneId" = m."id"
   AND ps."status" = 'PARTIALLY_PAID'
   AND ps."demandGeneratedDate" IS NULL
   AND m."status" = 'COMPLETED';
