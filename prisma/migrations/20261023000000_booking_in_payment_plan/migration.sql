-- The booking is not a construction milestone: it falls due as soon as a sale is created. A payment plan now carries its
-- booking % itself, and the "Booking" / "Token" milestone that used to be the first line of each plan is removed from the
-- project's construction milestones.
ALTER TABLE "payment_plans" ADD COLUMN "bookingPercent" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- A plan's first line, when it is the booking / token milestone
CREATE TEMP TABLE "booking_items" AS
SELECT DISTINCT ON (i."planId") i."id" AS "itemId", i."planId", i."milestoneId", i."percentOfAV"
FROM "payment_plan_items" i
JOIN "construction_milestones" m ON m."id" = i."milestoneId"
WHERE m."name" ~* '^(booking|token)'
ORDER BY i."planId", i."sequence";

-- Only if it really was the first line
DELETE FROM "booking_items" b
WHERE EXISTS (
  SELECT 1 FROM "payment_plan_items" i
  WHERE i."planId" = b."planId" AND i."sequence" < (SELECT "sequence" FROM "payment_plan_items" WHERE "id" = b."itemId")
);

UPDATE "payment_plans" p SET "bookingPercent" = b."percentOfAV" FROM "booking_items" b WHERE b."planId" = p."id";
DELETE FROM "payment_plan_items" WHERE "id" IN (SELECT "itemId" FROM "booking_items");

-- Booking / token milestones that no plan uses any more go. Sales made earlier keep their schedule line (it keeps its description);
-- it just no longer points at a construction milestone.
CREATE TEMP TABLE "unused_booking_milestones" AS
SELECT m."id"
FROM "construction_milestones" m
WHERE m."name" ~* '^(booking|token)'
  AND NOT EXISTS (SELECT 1 FROM "payment_plan_items" i WHERE i."milestoneId" = m."id");

UPDATE "payment_schedules" SET "milestoneId" = NULL WHERE "milestoneId" IN (SELECT "id" FROM "unused_booking_milestones");
DELETE FROM "construction_milestones" WHERE "id" IN (SELECT "id" FROM "unused_booking_milestones");

DROP TABLE "unused_booking_milestones";
DROP TABLE "booking_items";
