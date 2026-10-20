-- A project can say it will not sell some sale type + unit type combination (for example Rehab shops), so no payment plan is asked for it.
ALTER TABLE "projects" ADD COLUMN "paymentPlanOptOuts" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- A super-admin can set the milestone order by hand; from then on payment plan changes do not re-sort it.
ALTER TABLE "projects" ADD COLUMN "milestoneOrderManual" BOOLEAN NOT NULL DEFAULT false;
