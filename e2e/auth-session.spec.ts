import { test, expect } from '@playwright/test'
import { signSession, verifySession, SESSION_DURATION_MS } from '../api/_lib/auth'

// Playwright test bodies run in Node, not the browser — no `page` needed to
// exercise this module directly. This is the actual security-critical logic
// behind middleware.ts's gate, and it's fully testable in isolation without
// a real Vercel deployment (which the rest of the auth flow needs — see
// login-page.spec.ts and the manual verification steps in CLAUDE.md/the
// deployment plan).

test('a freshly signed session verifies against the same secret', async () => {
  const token = await signSession('correct-horse-battery-staple')
  await expect(verifySession(token, 'correct-horse-battery-staple')).resolves.toBe(true)
})

test('a session verified against a different secret is rejected', async () => {
  const token = await signSession('correct-horse-battery-staple')
  await expect(verifySession(token, 'wrong-secret')).resolves.toBe(false)
})

test('a tampered signature is rejected', async () => {
  const token = await signSession('correct-horse-battery-staple')
  const [payload, signature] = token.split('.')
  const tampered = `${payload}.${signature.slice(0, -1)}${signature.at(-1) === '0' ? '1' : '0'}`
  await expect(verifySession(tampered, 'correct-horse-battery-staple')).resolves.toBe(false)
})

test('a tampered expiry (payload) is rejected even though the signature parses', async () => {
  const token = await signSession('correct-horse-battery-staple')
  const [payload, signature] = token.split('.')
  const tampered = `${Number(payload) + 1_000_000}.${signature}`
  await expect(verifySession(tampered, 'correct-horse-battery-staple')).resolves.toBe(false)
})

test('an expired session is rejected', async () => {
  const longExpired = Date.now() - SESSION_DURATION_MS - 1000
  const token = await signSession('correct-horse-battery-staple', longExpired)
  await expect(verifySession(token, 'correct-horse-battery-staple')).resolves.toBe(false)
})

test('malformed tokens are rejected without throwing', async () => {
  await expect(verifySession(undefined, 'secret')).resolves.toBe(false)
  await expect(verifySession('', 'secret')).resolves.toBe(false)
  await expect(verifySession('no-dot-here', 'secret')).resolves.toBe(false)
  await expect(verifySession('123.not-hex-!!', 'secret')).resolves.toBe(false)
  await expect(verifySession('not-a-number.abcd', 'secret')).resolves.toBe(false)
})
