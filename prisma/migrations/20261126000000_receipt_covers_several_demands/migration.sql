-- One receipt can cover several demands (an excess payment carries to the next ones), so its payments share the receipt number
DROP INDEX "payments_receiptNumber_key";
CREATE INDEX "payments_receiptNumber_idx" ON "payments"("receiptNumber");
