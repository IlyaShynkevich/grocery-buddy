import { timingSafeEqual } from 'node:crypto'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { AUTH_COOKIE_NAME, SESSION_DURATION_MS, signSession } from './_lib/auth.js'

/** Constant-time string comparison — avoids leaking password length/prefix via response timing. */
function safeCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a)
  const bBuf = Buffer.from(b)
  if (aBuf.length !== bBuf.length) return false
  return timingSafeEqual(aBuf, bBuf)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' })
      return
    }

    const appPassword = process.env.APP_PASSWORD
    if (!appPassword) {
      // Only reachable at all on a deployment with no APP_PASSWORD set (the
      // public demo, or Production before it's configured) — middleware.ts
      // never gates access there in the first place, so this is a clean
      // "not configured" response rather than a crash, same convention as
      // extract-receipt.ts's missing-OPENAI_API_KEY handling.
      res.status(503).json({ error: 'Login is not configured on this deployment' })
      return
    }

    const body = req.body as { password?: unknown } | null
    const password = body?.password
    if (typeof password !== 'string' || !password) {
      res.status(400).json({ error: 'Missing "password"' })
      return
    }

    if (!safeCompare(password, appPassword)) {
      res.status(401).json({ error: 'Incorrect password' })
      return
    }

    const token = await signSession(appPassword)
    res.setHeader(
      'Set-Cookie',
      `${AUTH_COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${Math.floor(SESSION_DURATION_MS / 1000)}`,
    )
    res.status(200).json({ ok: true })
  } catch (error) {
    console.error('UNHANDLED_LOGIN_ERROR:', error)
    const message = error instanceof Error ? error.message : 'Unknown server error'
    res.status(500).json({ error: message })
  }
}
