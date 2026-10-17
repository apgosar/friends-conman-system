import { afterEach } from 'vitest'

// jest-dom matchers and RTL cleanup are only relevant (and only loadable) in a DOM test.
if (typeof document !== 'undefined') {
  const { cleanup } = await import('@testing-library/react')
  await import('@testing-library/jest-dom/vitest')
  afterEach(() => cleanup())
}
