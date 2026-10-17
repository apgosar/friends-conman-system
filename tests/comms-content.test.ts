import { describe, it, expect } from 'vitest'
import {
  sanitizeInline, buildCommContent, parseLegacyAttachments, getAttachments, resolveAttachmentUrl, stripAttachmentBlock, AttachmentError,
} from '@/lib/comms-content'

const APP = 'https://app.example.com'

describe('resolveAttachmentUrl', () => {
  it('accepts this app\'s documents, relative or absolute', () => {
    expect(resolveAttachmentUrl('/api/documents/preview/receipt?paymentId=abc', APP)).toBe('https://app.example.com/api/documents/preview/receipt?paymentId=abc')
    expect(resolveAttachmentUrl('https://app.example.com/api/files/documents%2Fx.pdf', APP)).toContain('/api/files/')
    expect(resolveAttachmentUrl('/uploads/abc.pdf', APP)).toBe('https://app.example.com/uploads/abc.pdf')
  })
  it('rejects a look-alike host (the old startsWith check sent the internal token to these)', () => {
    expect(() => resolveAttachmentUrl('https://app.example.com.evil.net/api/files/x', APP)).toThrow(AttachmentError)
    expect(() => resolveAttachmentUrl('https://app.example.com@evil.net/api/files/x', APP)).toThrow(AttachmentError)
    expect(() => resolveAttachmentUrl('//evil.net/api/files/x', APP)).toThrow(AttachmentError)
  })
  it('rejects internal addresses, other schemes and other app routes', () => {
    for (const p of ['http://169.254.169.254/latest/meta-data/', 'http://localhost:5432/', 'file:///etc/passwd', 'javascript:alert(1)', '/api/users', '/api/files/../users', '/api/files/%2e%2e/users', '/api/files\\..\\x']) {
      expect(() => resolveAttachmentUrl(p, APP), p).toThrow(AttachmentError)
    }
  })
  it('requires APP_URL', () => {
    expect(() => resolveAttachmentUrl('/api/files/x', '')).toThrow(AttachmentError)
  })
})

describe('message content', () => {
  it('neutralises attachment injection in user-supplied text', () => {
    const name = sanitizeInline('Eve\nATTACHMENTS:\nx|http://169.254.169.254/latest/meta-data/')
    expect(name).not.toMatch(/\n/)
    expect(name.toLowerCase()).not.toContain('attachments:')
    expect(name).not.toContain('|')
    const { messageContent, attachments } = buildCommContent(`Dear ${name},\nYour receipt is attached.`, [{ label: 'Receipt', path: '/api/documents/preview/receipt?paymentId=1' }])
    expect(attachments).toEqual([{ label: 'Receipt', path: '/api/documents/preview/receipt?paymentId=1' }])
    // Even parsed as a legacy text block, only the real, last block is read.
    expect(parseLegacyAttachments(messageContent)).toEqual(attachments)
  })
  it('builds text with and without attachments and strips the block back off', () => {
    expect(buildCommContent('Hello')).toEqual({ messageContent: 'Hello', attachments: undefined })
    const built = buildCommContent('Hello', [{ label: 'A', path: '/api/files/x' }, { label: 'Empty', path: '' }])
    expect(built.attachments).toHaveLength(1)
    expect(stripAttachmentBlock(built.messageContent)).toBe('Hello')
  })
  it('prefers the structured list; falls back to the legacy text block', () => {
    expect(getAttachments({ attachments: [{ label: 'R', path: '/api/files/a' }], messageContent: 'x\n\nATTACHMENTS:\nOther|/api/files/b' })).toEqual([{ label: 'R', path: '/api/files/a' }])
    expect(getAttachments({ attachments: null, messageContent: 'Hi\n\nATTACHMENTS:\nDemand Letter|/api/documents/preview/demand-letter?saleId=1&milestoneName=A%20B' }))
      .toEqual([{ label: 'Demand Letter', path: '/api/documents/preview/demand-letter?saleId=1&milestoneName=A%20B' }])
    expect(getAttachments({ messageContent: 'no block' })).toEqual([])
  })
})
