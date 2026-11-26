-- Before this release "Send Stern Reminder" only marked a demand as reminded: no message was ever sent. Put those demands
-- back in the pending list so the reminder can really be sent. The audit log keeps the record of who pressed the button.
UPDATE "payment_schedules"
SET "managementApprovedStern" = false, "managementApprovedAt" = NULL, "managementApprovedBy" = NULL
WHERE "managementApprovedStern" = true;
