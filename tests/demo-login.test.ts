import { describe, it, expect, afterEach } from 'vitest'
import { demoLogin } from '@/lib/demo-login'

const set = (email?: string, password?: string) => {
  if (email === undefined) delete process.env.DEMO_LOGIN_EMAIL; else process.env.DEMO_LOGIN_EMAIL = email
  if (password === undefined) delete process.env.DEMO_LOGIN_PASSWORD; else process.env.DEMO_LOGIN_PASSWORD = password
}

describe('demo login', () => {
  afterEach(() => set(undefined, undefined))

  it('is off unless both the email and the password are set', () => {
    expect(demoLogin()).toBeNull()
    set('judge@example.com', undefined)
    expect(demoLogin()).toBeNull()
    set(undefined, 'secret')
    expect(demoLogin()).toBeNull()
    set('', '')
    expect(demoLogin()).toBeNull()
  })

  it('gives the email and password when both are set, tidying the email only', () => {
    set('  judge@example.com ', ' pass with spaces ')
    expect(demoLogin()).toEqual({ email: 'judge@example.com', password: ' pass with spaces ' })
  })
})
