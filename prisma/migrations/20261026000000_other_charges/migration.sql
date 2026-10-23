-- Other charges: what a buyer pays besides the price, due with the last milestone. Set per project; a sale keeps its own copy.
CREATE TABLE "project_charges" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amountType" TEXT NOT NULL DEFAULT 'FIXED',
    "amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "appliesTo" TEXT NOT NULL DEFAULT 'BOTH',
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_charges_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "project_charges_projectId_idx" ON "project_charges"("projectId");

ALTER TABLE "project_charges" ADD CONSTRAINT "project_charges_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sales" ADD COLUMN "otherCharges" JSONB;

-- Every project starts with the charges of the PAYABLES table of the sale agreement
INSERT INTO "project_charges" ("id", "projectId", "name", "amountType", "amount", "appliesTo", "sequence", "updatedAt")
SELECT substr(md5(random()::text || p."id" || v."seq"::text), 1, 25), p."id", v."name", v."amountType", v."amount", v."appliesTo", v."seq", CURRENT_TIMESTAMP
FROM "projects" p
CROSS JOIN (VALUES
  (1, 'Share Money, Application for Membership, Entrance fees of the Society or Body Corporate or Limited Company, Federation/Apex Body (Accountable)', 'FIXED', 600, 'BOTH'),
  (2, 'Proportionate share of taxes and other charges/levies in respect of the building in which the Office/Shop is situated for 12 months. (Accountable)', 'AS_DETERMINED', 0, 'BOTH'),
  (3, 'Provisional monthly contribution for outgoings of the Society/Body Corporate for 12 months. (Accountable)', 'FIXED', 100000, 'BOTH'),
  (4, 'Charges Payable towards Water, Electric and other Utility and Service Connection. (Non-Accountable)', 'FIXED', 25000, 'BOTH'),
  (5, 'Charges Payable for electrical receiving and Sub-Station provided in the Layout. (Non-Accountable)', 'FIXED', 25000, 'BOTH'),
  (6, 'MCGM Development and Betterment charges @ Rs.600/- per sq. feet (Non-Accountable)', 'PER_SQFT', 600, 'BOTH'),
  (7, 'Formation and registration of the Society or Association or Limited Company, Federation/Apex Body including for meeting all legal cost charges and expenses, professional fees payable to the Advocates of the Promoters in connection with formation of Society or Association or Limited Company, Federation/Apex Body and for preparation of Bye-Laws, Rules and Regulations, Memorandum & Articles of Associations, etc. (Non-Accountable)', 'FIXED', 25000, 'BOTH'),
  (8, 'Legal charges for this Agreement (Non-Accountable)', 'FIXED', 15000, 'BOTH'),
  (9, 'Common Area (Gymnasium, Other Amenities) charges (Non-Accountable)', 'FIXED', 100000, 'RESIDENTIAL')
) AS v("seq", "name", "amountType", "amount", "appliesTo");
