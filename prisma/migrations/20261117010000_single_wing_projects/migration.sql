-- A single-building (single wing) project has no concept of a wing: no "Wing A" is shown anywhere for it. Until now this was
-- guessed from the number of wings; it is now a setting of the project, chosen when the structure is built.
ALTER TABLE "projects" ADD COLUMN "singleWing" BOOLEAN NOT NULL DEFAULT false;

-- Projects that already have exactly one wing (not counting a commercial block) are single-wing
UPDATE "projects" AS p
   SET "singleWing" = true
 WHERE (SELECT COUNT(*) FROM "wings" w WHERE w."projectId" = p."id" AND lower(w."name") <> 'commercial') = 1;
