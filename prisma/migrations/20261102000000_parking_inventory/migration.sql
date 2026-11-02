-- CreateTable
CREATE TABLE "parking_fields" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parking_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parking_slots" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "values" JSONB NOT NULL DEFAULT '{}',
    "uniqueKey" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT '',
    "allottedTo" TEXT,
    "registered" BOOLEAN NOT NULL DEFAULT false,
    "saleId" TEXT,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parking_slots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "parking_fields_projectId_idx" ON "parking_fields"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "parking_fields_projectId_key_key" ON "parking_fields"("projectId", "key");

-- CreateIndex
CREATE INDEX "parking_slots_projectId_idx" ON "parking_slots"("projectId");

-- CreateIndex
CREATE INDEX "parking_slots_saleId_idx" ON "parking_slots"("saleId");

-- CreateIndex
CREATE UNIQUE INDEX "parking_slots_projectId_uniqueKey_key" ON "parking_slots"("projectId", "uniqueKey");

-- AddForeignKey
ALTER TABLE "parking_fields" ADD CONSTRAINT "parking_fields_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parking_slots" ADD CONSTRAINT "parking_slots_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parking_slots" ADD CONSTRAINT "parking_slots_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;
