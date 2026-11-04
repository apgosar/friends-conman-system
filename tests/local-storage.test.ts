import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'

// The local adapter is what holds an on-prem server's uploaded documents (a Docker volume), so it gets its own checks.
describe('local storage adapter', () => {
  let dir: string
  let original: string | undefined
  let adapter: typeof import('@/lib/storage/local-adapter').localAdapter

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'neev-files-'))
    original = process.env.LOCAL_STORAGE_DIR
    process.env.LOCAL_STORAGE_DIR = dir // read once, when the module loads
    vi.resetModules()
    adapter = (await import('@/lib/storage/local-adapter')).localAdapter
  })

  afterAll(async () => {
    if (original === undefined) delete process.env.LOCAL_STORAGE_DIR
    else process.env.LOCAL_STORAGE_DIR = original
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('stores a file under folder/name and serves it back', async () => {
    const buffer = Buffer.from('agreement body')
    const url = await adapter.uploadFile({ buffer, mimeType: 'application/pdf', folder: 'documents', fileName: 'a.pdf' })
    expect(url).toBe('/api/files/documents%2Fa.pdf')
    expect((await adapter.downloadFile('documents/a.pdf')).equals(buffer)).toBe(true)
    expect(await fs.readFile(path.join(dir, 'documents', 'a.pdf'))).toEqual(buffer)
  })

  it('names the file itself when none is given', async () => {
    const url = await adapter.uploadFile({ buffer: Buffer.from('x'), mimeType: 'image/png', folder: 'kyc' })
    const key = decodeURIComponent(url.replace('/api/files/', ''))
    expect(key).toMatch(/^kyc\/[0-9a-f-]{36}$/)
    expect((await adapter.downloadFile(key)).toString()).toBe('x')
  })

  it('leaves no temporary file behind after a write', async () => {
    await adapter.uploadFile({ buffer: Buffer.from('y'), mimeType: 'text/plain', folder: 'tidy', fileName: 'one.txt' })
    expect(await fs.readdir(path.join(dir, 'tidy'))).toEqual(['one.txt'])
  })

  it('replaces a file written under the same name', async () => {
    await adapter.uploadFile({ buffer: Buffer.from('old'), mimeType: 'text/plain', folder: 'same', fileName: 'f.txt' })
    await adapter.uploadFile({ buffer: Buffer.from('new'), mimeType: 'text/plain', folder: 'same', fileName: 'f.txt' })
    expect((await adapter.downloadFile('same/f.txt')).toString()).toBe('new')
  })

  it('reports a missing file as ENOENT, which the file route turns into "not found"', async () => {
    await expect(adapter.downloadFile('documents/missing.pdf')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('deletes a file, and deleting a missing one is not an error', async () => {
    await adapter.uploadFile({ buffer: Buffer.from('z'), mimeType: 'text/plain', folder: 'gone', fileName: 'z.txt' })
    await adapter.deleteFile('gone/z.txt')
    await expect(adapter.downloadFile('gone/z.txt')).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(adapter.deleteFile('gone/z.txt')).resolves.toBeUndefined()
  })

  it('refuses a key that climbs out of the storage folder', async () => {
    await expect(adapter.downloadFile('../../etc/passwd')).rejects.toThrow('Invalid storage key')
    await expect(adapter.deleteFile('../outside.txt')).rejects.toThrow('Invalid storage key')
    await expect(adapter.getPresignedUrl('../outside.txt')).rejects.toThrow('Invalid storage key')
    await expect(adapter.uploadFile({ buffer: Buffer.from('x'), mimeType: 'text/plain', folder: '../escape', fileName: 'x.txt' })).rejects.toThrow('Invalid storage key')
  })
})
