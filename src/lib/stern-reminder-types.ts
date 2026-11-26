/** The stern reminder as shown before it is sent (lib/stern-reminder.ts builds it; the dialog shows it). */
export interface SternReminderPreview {
  /** The email's subject line */
  subject: string
  /** One per buyer who will get it */
  messages: { buyerName: string; email: string | null; whatsappNumber: string | null; text: string }[]
  attachment: { label: string; url: string }
  whatsapp: {
    values: { label: string; value: string }[]
  }
}
