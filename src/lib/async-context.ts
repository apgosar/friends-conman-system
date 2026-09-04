import { AsyncLocalStorage } from 'async_hooks'

export interface SessionContext {
  userId: string
  email: string
  role: string
}

export const sessionContext = new AsyncLocalStorage<SessionContext>()

export function getSessionContext(): SessionContext | undefined {
  return sessionContext.getStore()
}
