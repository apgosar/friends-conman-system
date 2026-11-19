-- Whether the application sends a sale's buyers their messages (demand letters, receipts, reminders). A new sale starts with it
-- off; an administrator turns it on from the sale page. Sales that already exist keep sending, as they always have.
ALTER TABLE "sales" ADD COLUMN "commsEnabled" BOOLEAN NOT NULL DEFAULT true;
