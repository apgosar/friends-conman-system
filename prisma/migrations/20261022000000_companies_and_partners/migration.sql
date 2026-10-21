-- Companies and their partners. A project picks a company (instead of holding its own copy of the name, address and GSTIN),
-- and a sale agreement names two of the company's partners.

CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "panNumber" TEXT,
    "gstin" TEXT,
    "address" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "partners" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "panNumber" TEXT,
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partners_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "companies_name_key" ON "companies"("name");
CREATE INDEX "partners_companyId_idx" ON "partners"("companyId");
ALTER TABLE "partners" ADD CONSTRAINT "partners_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing projects: one company per distinct company name (the earliest project's address and GSTIN are kept), then link the projects.
-- Their PAN is not known yet: it is asked for the next time the company is edited.
INSERT INTO "companies" ("id", "name", "gstin", "address", "updatedAt")
SELECT gen_random_uuid()::text, c."companyName", c."companyGstin", c."companyAddress", CURRENT_TIMESTAMP
FROM (
    SELECT DISTINCT ON ("companyName") "companyName", "companyGstin", "companyAddress"
    FROM "projects"
    ORDER BY "companyName", "createdAt"
) c;

ALTER TABLE "projects" ADD COLUMN "companyId" TEXT;
UPDATE "projects" p SET "companyId" = c."id" FROM "companies" c WHERE c."name" = p."companyName";
ALTER TABLE "projects" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "projects" ADD CONSTRAINT "projects_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "projects" DROP COLUMN "companyName", DROP COLUMN "companyAddress", DROP COLUMN "companyGstin";

-- The partners named in a generated sale agreement
ALTER TABLE "documents" ADD COLUMN "partnerIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
