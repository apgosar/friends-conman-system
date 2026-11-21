import { connection } from 'next/server'
import { demoLogin } from '@/lib/demo-login'
import LoginForm from './LoginForm'

/** The sign-in page. On a demo deployment (DEMO_LOGIN_EMAIL and DEMO_LOGIN_PASSWORD set on the server) the form starts filled in. */
export default async function LoginPage() {
  await connection() // read the server's settings on each visit, never frozen into the build
  return <LoginForm demo={demoLogin()} />
}
