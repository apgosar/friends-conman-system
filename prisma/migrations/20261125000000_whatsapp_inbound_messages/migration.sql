-- Messages people send to the WhatsApp business number (kept to answer once a day and to see what was said)
CREATE TABLE "whatsapp_inbound" (
    "id" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "phone" TEXT NOT NULL,
    "senderName" TEXT,
    "messageType" TEXT NOT NULL DEFAULT 'text',
    "text" TEXT,
    "saleId" TEXT,
    "buyerId" TEXT,
    "autoRepliedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_inbound_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "whatsapp_inbound_providerMessageId_key" ON "whatsapp_inbound"("providerMessageId");
CREATE INDEX "whatsapp_inbound_phone_autoRepliedAt_idx" ON "whatsapp_inbound"("phone", "autoRepliedAt");
