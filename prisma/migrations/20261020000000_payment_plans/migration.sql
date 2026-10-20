-- Payment plans: a project can have several (20/80, 20/30/50 ...), one default per sale type and unit type.
-- The project's milestone list stays, and holds every milestone used by any plan.

CREATE TABLE "payment_plans" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "saleType" TEXT NOT NULL,
    "unitType" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_plans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payment_plan_items" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "milestoneId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "percentOfAV" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "payment_plan_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "payment_plans_projectId_idx" ON "payment_plans"("projectId");
CREATE UNIQUE INDEX "payment_plans_projectId_saleType_unitType_name_key" ON "payment_plans"("projectId", "saleType", "unitType", "name");
CREATE INDEX "payment_plan_items_milestoneId_idx" ON "payment_plan_items"("milestoneId");
CREATE UNIQUE INDEX "payment_plan_items_planId_milestoneId_key" ON "payment_plan_items"("planId", "milestoneId");

ALTER TABLE "payment_plans" ADD CONSTRAINT "payment_plans_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_plan_items" ADD CONSTRAINT "payment_plan_items_planId_fkey" FOREIGN KEY ("planId") REFERENCES "payment_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_plan_items" ADD CONSTRAINT "payment_plan_items_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "construction_milestones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Database guard: never two default plans for the same project, sale type and unit type
CREATE UNIQUE INDEX "payment_plans_one_default" ON "payment_plans"("projectId", "saleType", "unitType") WHERE "isDefault";

-- Existing projects: the percentages already on their milestones become a "Standard plan", the default for every
-- sale type / unit type the project sells, so nothing changes for sales created from now on until a plan is edited.
INSERT INTO "payment_plans" ("id", "projectId", "name", "saleType", "unitType", "isDefault", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, p."id", 'Standard plan', st.v, ut.v, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "projects" p
CROSS JOIN LATERAL unnest(CASE p."type" WHEN 'FRESH' THEN ARRAY['FRESH'] WHEN 'REDEVELOPMENT' THEN ARRAY['REDEVELOPMENT'] ELSE ARRAY['FRESH', 'REDEVELOPMENT'] END) AS st(v)
CROSS JOIN (VALUES ('RESIDENTIAL'), ('COMMERCIAL')) AS ut(v)
WHERE EXISTS (SELECT 1 FROM "construction_milestones" m WHERE m."projectId" = p."id" AND m."percentOfAV" > 0);

INSERT INTO "payment_plan_items" ("id", "planId", "milestoneId", "sequence", "percentOfAV")
SELECT gen_random_uuid()::text, pl."id", m."id", m."sequence", m."percentOfAV"
FROM "payment_plans" pl
JOIN "construction_milestones" m ON m."projectId" = pl."projectId" AND m."percentOfAV" > 0;
