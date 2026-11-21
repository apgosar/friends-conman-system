/**
 * Demo access for people who are judging or trying the app (the Startup Buildathon judges): when the server has a demo email and
 * password, the sign-in page fills them in, so a visitor only presses Sign In.
 *
 * It is switched on only by setting DEMO_LOGIN_EMAIL and DEMO_LOGIN_PASSWORD on the server, and the password is then shown to every
 * visitor of the page. So it is for a deployment that holds made-up data only, with an account of its own (an Admin, not a
 * Super Admin, so nobody can change users or settings) and a password used nowhere else. Leave both empty for a real customer.
 */
export interface DemoLogin {
  email: string
  password: string
}

export function demoLogin(): DemoLogin | null {
  const email = process.env.DEMO_LOGIN_EMAIL?.trim()
  const password = process.env.DEMO_LOGIN_PASSWORD
  return email && password ? { email, password } : null
}
