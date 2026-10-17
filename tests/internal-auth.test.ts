import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { isCronRequest, isInternalRequest, safeEqual, internalAuthHeaders, INTERNAL_AUTH_HEADER } from '@/lib/internal-auth'

const SECRET = 'a-proper-long-shared-secret-1234'
const req = (headers: Record<string, string>) => new Request('http://localhost/api/cron/daily', { headers })

describe('internal / cron auth', () => {
  const original = process.env.CRON_SECRET
  afterEach(() => { process.env.CRON_SECRET = original; if (original === undefined) delete process.env.CRON_SECRET })

  describe('with a valid secret', () => {
    beforeEach(() => { process.env.CRON_SECRET = SECRET })
    it('accepts the bearer token', () => expect(isCronRequest(req({ authorization: `Bearer ${SECRET}` }))).toBe(true))
    it('accepts the internal header', () => expect(isCronRequest(req({ [INTERNAL_AUTH_HEADER]: SECRET }))).toBe(true))
    it('rejects a wrong token, an empty one and no header', () => {
      expect(isCronRequest(req({ authorization: 'Bearer nope' }))).toBe(false)
      expect(isCronRequest(req({ authorization: 'Bearer ' }))).toBe(false)
      expect(isCronRequest(req({}))).toBe(false)
    })
    it('does not treat the cron bearer as the internal header', () => {
      expect(isInternalRequest(req({ authorization: `Bearer ${SECRET}` }))).toBe(false)
    })
  })

  describe('when CRON_SECRET is not usable', () => {
    for (const [label, value] of [['unset', undefined], ['empty', ''], ['too short', 'short'], ['placeholder', 'CHANGE_ME_generate_a_long_random_value']] as const) {
      it(`rejects everything (${label})`, () => {
        if (value === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = value
        // The original bug: the expected string was literally "Bearer undefined".
        expect(isCronRequest(req({ authorization: 'Bearer undefined' }))).toBe(false)
        expect(isCronRequest(req({ authorization: `Bearer ${value}` }))).toBe(false)
        expect(isInternalRequest(req({ [INTERNAL_AUTH_HEADER]: String(value) }))).toBe(false)
        expect(internalAuthHeaders()).toEqual({})
      })
    }
  })

  it('safeEqual compares whole strings', () => {
    expect(safeEqual('abc', 'abc')).toBe(true)
    expect(safeEqual('abc', 'abd')).toBe(false)
    expect(safeEqual('abc', 'abcd')).toBe(false)
    expect(safeEqual('', '')).toBe(true)
  })
})
