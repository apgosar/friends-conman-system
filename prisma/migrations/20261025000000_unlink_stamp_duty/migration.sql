-- Stamp duty and registration are no longer tied to a construction milestone (they used to follow Plinth). The demand is
-- raised by hand from the sale page. Existing rows keep their status; those still waiting no longer trigger on Plinth.
UPDATE "payment_schedules" SET "milestoneId" = NULL WHERE "description" = 'Stamp Duty and Registration' AND "milestoneId" IS NOT NULL;
