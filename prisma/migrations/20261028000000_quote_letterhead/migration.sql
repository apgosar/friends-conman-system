-- The company's letterhead for quotations (an A4 image) and the room it needs at the top and bottom of the page.
ALTER TABLE "companies" ADD COLUMN "letterheadUrl" TEXT;
ALTER TABLE "companies" ADD COLUMN "quoteMarginTopMm" INTEGER NOT NULL DEFAULT 40;
ALTER TABLE "companies" ADD COLUMN "quoteMarginBottomMm" INTEGER NOT NULL DEFAULT 30;
