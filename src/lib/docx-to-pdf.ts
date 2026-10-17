import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import os from 'os'
import path from 'path'
import { randomUUID } from 'crypto'

/**
 * Convert a filled .docx to PDF with LibreOffice (headless), so letterhead, fonts, headers/footers and
 * tables come out as they look in Word. Used when a DOCX Demand Letter / Receipt is sent by email or WhatsApp.
 *
 * Needs LibreOffice: it is installed in the Docker image; locally install it and, if it is not on PATH,
 * set SOFFICE_PATH to the soffice executable.
 */
export class DocxPdfUnavailableError extends Error {}

const WINDOWS_PATHS = [
  'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
  'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
]

function sofficeCandidates(): string[] {
  const fromEnv = process.env.SOFFICE_PATH ? [process.env.SOFFICE_PATH] : []
  return [...fromEnv, ...WINDOWS_PATHS.filter(existsSync), 'soffice', 'libreoffice']
}

function run(cmd: string, args: string[], timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (d) => { stderr += d.toString() })
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('LibreOffice timed out')) }, timeoutMs)
    child.on('error', (err: NodeJS.ErrnoException) => {
      clearTimeout(timer)
      reject(err.code === 'ENOENT' ? new DocxPdfUnavailableError(`LibreOffice not found (${cmd})`) : err)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve()
      else reject(new Error(`LibreOffice exited with code ${code}: ${stderr.slice(0, 300)}`))
    })
  })
}

export async function docxToPdf(docx: Buffer): Promise<Buffer> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'docx2pdf-'))
  try {
    const input = path.join(dir, 'document.docx')
    await writeFile(input, docx)
    // Separate profile per run: LibreOffice refuses to run two conversions on one profile at once
    const profile = `file:///${path.join(dir, 'profile-' + randomUUID()).replace(/\\/g, '/').replace(/^\//, '')}`

    let lastErr: unknown
    for (const cmd of sofficeCandidates()) {
      try {
        await run(cmd, ['--headless', '--norestore', '--nologo', `-env:UserInstallation=${profile}`, '--convert-to', 'pdf', '--outdir', dir, input], 90_000)
        return await readFile(path.join(dir, 'document.pdf'))
      } catch (err) {
        lastErr = err
        if (!(err instanceof DocxPdfUnavailableError)) throw err // found it but conversion failed: don't mask that
      }
    }
    throw lastErr instanceof Error ? new DocxPdfUnavailableError('DOCX to PDF conversion needs LibreOffice. Install it or set SOFFICE_PATH.') : lastErr
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}
