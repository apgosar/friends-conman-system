import { PDFDocument, EncryptedPDFError } from '@cantoo/pdf-lib'
import { fail } from '@/lib/errors'

/**
 * Password-protected PDFs, as people upload them for KYC (an e-Aadhaar or e-PAN PDF comes locked with a password). The OCR service
 * cannot read a locked file, so the file is opened here with the password the person typed and handed on without the lock.
 * The password is used for this one call only: it is never stored or logged.
 */
export type OpenedFile =
  | { status: 'ready'; buffer: Buffer; unlocked: boolean } // the file to read: the original, or the unlocked copy of a protected PDF
  | { status: 'password-required' }
  | { status: 'wrong-password' }

const isPdf = (b: Buffer) => b.subarray(0, 1024).includes('%PDF-')

const hasLock = (b: Buffer) => b.includes('/Encrypt')

/** A copy of the document without the lock: its pages carried into a new file (saving the opened file would lock it again). */
async function withoutLock(opened: PDFDocument): Promise<Buffer> {
  const clean = await PDFDocument.create()
  const pages = await clean.copyPages(opened, opened.getPageIndices())
  pages.forEach((page) => clean.addPage(page))
  return Buffer.from(await clean.save())
}

export async function openForReading(buffer: Buffer, password?: string): Promise<OpenedFile> {
  if (!isPdf(buffer)) return { status: 'ready', buffer, unlocked: false } // an image: nothing to open

  try {
    await PDFDocument.load(buffer)
    return { status: 'ready', buffer, unlocked: false } // not protected
  } catch (err) {
    if (!(err instanceof EncryptedPDFError)) {
      // Some tools write PDFs that viewers open but this parser rejects (stray bytes after the header). With no lock on the file there
      // is nothing to open here, so it goes on as it is and the reader judges it.
      if (!hasLock(buffer)) return { status: 'ready', buffer, unlocked: false }
      throw fail('invalid', 'The PDF could not be read. Upload the original file again')
    }
  }

  // Protected. A file that is only restricted (no password to open it) opens with an empty one, without asking.
  for (const attempt of password ? [password] : ['']) {
    try {
      return { status: 'ready', buffer: await withoutLock(await PDFDocument.load(buffer, { password: attempt })), unlocked: true }
    } catch (err) {
      if (err instanceof Error && /password/i.test(err.message)) continue
      throw fail('invalid', 'The PDF could not be opened. Upload the original file again')
    }
  }
  return password ? { status: 'wrong-password' } : { status: 'password-required' }
}
