-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'VIEWER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inquiries" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "mobileNumber" TEXT NOT NULL,
    "agreementValue" DOUBLE PRECISION NOT NULL,
    "parkingIncluded" BOOLEAN NOT NULL DEFAULT false,
    "stampDuty" DOUBLE PRECISION NOT NULL,
    "gst" DOUBLE PRECISION NOT NULL,
    "registration" DOUBLE PRECISION NOT NULL,
    "totalCost" DOUBLE PRECISION NOT NULL,
    "email" TEXT,
    "source" TEXT,
    "sourceDetail" TEXT,
    "validUntil" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "convertedSaleId" TEXT,
    "lostReason" TEXT,
    "lostNote" TEXT,
    "lastSharedAt" TIMESTAMP(3),
    "lastSharedVia" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inquiries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "reraNumber" TEXT,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'Maharashtra',
    "type" TEXT NOT NULL DEFAULT 'FRESH',
    "status" TEXT NOT NULL DEFAULT 'PLANNING',
    "launchDate" TIMESTAMP(3),
    "expectedCompletion" TIMESTAMP(3),
    "companyName" TEXT NOT NULL,
    "companyAddress" TEXT NOT NULL,
    "companyGstin" TEXT,
    "stampDutyPercent" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "regChargesPercent" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "carParkingCharges" DOUBLE PRECISION NOT NULL DEFAULT 500000,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wings" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "totalFloors" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "floors" (
    "id" TEXT NOT NULL,
    "wingId" TEXT NOT NULL,
    "floorNumber" INTEGER NOT NULL,
    "floorPlanUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "floors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unit_types" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'FLAT',
    "name" TEXT NOT NULL,
    "configuration" TEXT NOT NULL,
    "carpetAreaSqft" DOUBLE PRECISION NOT NULL,
    "builtupAreaSqft" DOUBLE PRECISION,
    "basePricePerSqft" DOUBLE PRECISION,
    "floorPlanUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "unit_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "units" (
    "id" TEXT NOT NULL,
    "floorId" TEXT NOT NULL,
    "unitTypeId" TEXT,
    "category" TEXT NOT NULL DEFAULT 'FLAT',
    "unitNumber" TEXT NOT NULL,
    "configuration" TEXT NOT NULL,
    "carpetAreaSqft" DOUBLE PRECISION NOT NULL,
    "builtupAreaSqft" DOUBLE PRECISION,
    "basePricePerSqft" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "statusManual" BOOLEAN NOT NULL DEFAULT false,
    "bookedByName" TEXT,
    "bookedByMobile" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "newUnitId" TEXT,
    "name" TEXT NOT NULL,
    "oldFlatNumber" TEXT NOT NULL,
    "oldAreaSqft" DOUBLE PRECISION NOT NULL,
    "extraAreaSqft" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "whatsappNumber" TEXT,
    "email" TEXT,
    "receiveComms" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales" (
    "id" TEXT NOT NULL,
    "saleNumber" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "tenantId" TEXT,
    "saleType" TEXT NOT NULL DEFAULT 'FRESH',
    "agreementValue" DOUBLE PRECISION NOT NULL,
    "gstAmount" DOUBLE PRECISION NOT NULL,
    "stampDuty" DOUBLE PRECISION,
    "registrationCharges" DOUBLE PRECISION,
    "carParking" BOOLEAN NOT NULL DEFAULT false,
    "carParkingCharges" DOUBLE PRECISION,
    "parkingPodiumLevel" TEXT,
    "parkingFloor" TEXT,
    "parkingNumber" TEXT,
    "bookingAmount" DOUBLE PRECISION,
    "bookingDate" TIMESTAMP(3) NOT NULL,
    "agreementDate" TIMESTAMP(3),
    "possessionDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'BOOKED',
    "nameChangeHistory" JSONB,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "buyers" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT,
    "whatsappNumber" TEXT,
    "panNumber" TEXT,
    "aadhaarNumber" TEXT,
    "address" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "sequence" INTEGER NOT NULL DEFAULT 1,
    "receiveComms" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "buyers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kyc_documents" (
    "id" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "docType" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UPLOADED',
    "rejectionReason" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kyc_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "construction_milestones" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "percentOfAV" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "plannedDate" TIMESTAMP(3),
    "actualDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'UPCOMING',
    "architectCertificateUrl" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "construction_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_schedules" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "milestoneId" TEXT,
    "description" TEXT NOT NULL,
    "principalAmount" DOUBLE PRECISION NOT NULL,
    "gstAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dueDate" TIMESTAMP(3),
    "demandGeneratedDate" TIMESTAMP(3),
    "interestAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'UPCOMING',
    "reminderCount" INTEGER NOT NULL DEFAULT 0,
    "lastReminderAt" TIMESTAMP(3),
    "managementEscalated" BOOLEAN NOT NULL DEFAULT false,
    "managementApprovedStern" BOOLEAN NOT NULL DEFAULT false,
    "managementApprovedAt" TIMESTAMP(3),
    "managementApprovedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "gstPaid" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "mode" TEXT NOT NULL,
    "referenceNumber" TEXT,
    "bankName" TEXT,
    "remark" TEXT,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "clearedDate" TIMESTAMP(3),
    "receiptNumber" TEXT NOT NULL,
    "receiptPdfUrl" TEXT,
    "receiptSent" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tds_records" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "tdsAmount" DOUBLE PRECISION NOT NULL,
    "form26QBAckNumber" TEXT,
    "tdsDepositedDate" TIMESTAMP(3),
    "certificateUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tds_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loans" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "sanctionedAmount" DOUBLE PRECISION NOT NULL,
    "sanctionLetterUrl" TEXT,
    "totalDisbursed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'APPLIED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loan_disbursements" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "referenceNo" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loan_disbursements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "templates" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "templateHtml" TEXT,
    "fileUrl" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "templateId" TEXT,
    "type" TEXT NOT NULL,
    "pdfUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "generatedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communication_logs" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "buyerId" TEXT,
    "documentId" TEXT,
    "channel" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "messageContent" TEXT,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "providerMessageId" TEXT,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "communication_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "projectId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "oldValues" JSONB,
    "newValues" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "inquiries_unitId_idx" ON "inquiries"("unitId");

-- CreateIndex
CREATE INDEX "wings_projectId_idx" ON "wings"("projectId");

-- CreateIndex
CREATE INDEX "floors_wingId_idx" ON "floors"("wingId");

-- CreateIndex
CREATE INDEX "unit_types_projectId_idx" ON "unit_types"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "unit_types_projectId_name_key" ON "unit_types"("projectId", "name");

-- CreateIndex
CREATE INDEX "units_floorId_idx" ON "units"("floorId");

-- CreateIndex
CREATE INDEX "units_unitTypeId_idx" ON "units"("unitTypeId");

-- CreateIndex
CREATE INDEX "units_status_idx" ON "units"("status");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_newUnitId_key" ON "tenants"("newUnitId");

-- CreateIndex
CREATE INDEX "tenants_projectId_idx" ON "tenants"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "sales_saleNumber_key" ON "sales"("saleNumber");

-- CreateIndex
CREATE UNIQUE INDEX "sales_tenantId_key" ON "sales"("tenantId");

-- CreateIndex
CREATE INDEX "sales_projectId_idx" ON "sales"("projectId");

-- CreateIndex
CREATE INDEX "sales_unitId_idx" ON "sales"("unitId");

-- CreateIndex
CREATE INDEX "sales_status_idx" ON "sales"("status");

-- CreateIndex
CREATE INDEX "sales_deletedAt_idx" ON "sales"("deletedAt");

-- CreateIndex
CREATE INDEX "buyers_saleId_idx" ON "buyers"("saleId");

-- CreateIndex
CREATE INDEX "kyc_documents_buyerId_idx" ON "kyc_documents"("buyerId");

-- CreateIndex
CREATE INDEX "kyc_documents_status_idx" ON "kyc_documents"("status");

-- CreateIndex
CREATE INDEX "construction_milestones_projectId_idx" ON "construction_milestones"("projectId");

-- CreateIndex
CREATE INDEX "payment_schedules_saleId_idx" ON "payment_schedules"("saleId");

-- CreateIndex
CREATE INDEX "payment_schedules_status_idx" ON "payment_schedules"("status");

-- CreateIndex
CREATE UNIQUE INDEX "payments_receiptNumber_key" ON "payments"("receiptNumber");

-- CreateIndex
CREATE INDEX "payments_saleId_idx" ON "payments"("saleId");

-- CreateIndex
CREATE INDEX "payments_scheduleId_idx" ON "payments"("scheduleId");

-- CreateIndex
CREATE INDEX "payments_deletedAt_idx" ON "payments"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "tds_records_paymentId_key" ON "tds_records"("paymentId");

-- CreateIndex
CREATE INDEX "loans_saleId_idx" ON "loans"("saleId");

-- CreateIndex
CREATE INDEX "templates_projectId_idx" ON "templates"("projectId");

-- CreateIndex
CREATE INDEX "documents_saleId_idx" ON "documents"("saleId");

-- CreateIndex
CREATE INDEX "documents_status_idx" ON "documents"("status");

-- CreateIndex
CREATE INDEX "documents_deletedAt_idx" ON "documents"("deletedAt");

-- CreateIndex
CREATE INDEX "communication_logs_saleId_idx" ON "communication_logs"("saleId");

-- CreateIndex
CREATE INDEX "communication_logs_status_idx" ON "communication_logs"("status");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wings" ADD CONSTRAINT "wings_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "floors" ADD CONSTRAINT "floors_wingId_fkey" FOREIGN KEY ("wingId") REFERENCES "wings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_types" ADD CONSTRAINT "unit_types_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "floors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_unitTypeId_fkey" FOREIGN KEY ("unitTypeId") REFERENCES "unit_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_newUnitId_fkey" FOREIGN KEY ("newUnitId") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buyers" ADD CONSTRAINT "buyers_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_documents" ADD CONSTRAINT "kyc_documents_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "buyers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_milestones" ADD CONSTRAINT "construction_milestones_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_schedules" ADD CONSTRAINT "payment_schedules_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_schedules" ADD CONSTRAINT "payment_schedules_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "construction_milestones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "payment_schedules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tds_records" ADD CONSTRAINT "tds_records_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_disbursements" ADD CONSTRAINT "loan_disbursements_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "loans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "templates" ADD CONSTRAINT "templates_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_logs" ADD CONSTRAINT "communication_logs_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_logs" ADD CONSTRAINT "communication_logs_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "buyers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_logs" ADD CONSTRAINT "communication_logs_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

