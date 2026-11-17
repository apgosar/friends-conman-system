-- How many days after a demand is raised it falls due, now a setting of each project (Edit project). The columns start at
-- the values that were fixed in the app until now, so every existing project behaves as before.
ALTER TABLE "projects" ADD COLUMN "demandDueDays" INTEGER NOT NULL DEFAULT 14;
ALTER TABLE "projects" ADD COLUMN "bookingDueDays" INTEGER NOT NULL DEFAULT 15;
