/**
 * Stateless signed-session helper shared by middleware.ts (Edge runtime) and
 * api/login.ts (Node runtime) — both runtimes expose Web Crypto's
 * `crypto.subtle`, so one implementation works unmodified in either place
 * with no session store (KV/DB) needed. A session token is
 * "<expiresAtMs>.<hex HMAC-SHA256 signature over expiresAtMs>", signed with
 * APP_PASSWORD itself as the HMAC key — verification just recomputes and
 * compares the signature, so rotating APP_PASSWORD instantly invalidates
 * every previously-issued token with no extra bookkeeping.
 */

export const AUTH_COOKIE_NAME = 'gb_auth'
export const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

function bytesToHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length === 0 || hex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(hex)) return null
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return bytes
}

// CryptoKey isn't ambiently available as a type under this project's
// Node-only (no "dom") lib config, even though the runtime global `crypto`
// is — derived from importKey's own return type instead of importing it.
type HmacKey = Awaited<ReturnType<typeof crypto.subtle.importKey>>

function importHmacKey(secret: string): Promise<HmacKey> {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ])
}

/** Mints a new session token, valid for SESSION_DURATION_MS from now (or from `now` if given, for testing). */
export async function signSession(secret: string, now: number = Date.now()): Promise<string> {
  const expiresAt = now + SESSION_DURATION_MS
  const payload = String(expiresAt)
  const key = await importHmacKey(secret)
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  return `${payload}.${bytesToHex(signature)}`
}

/** True iff `token` is a well-formed, correctly-signed, not-yet-expired session for `secret`. */
export async function verifySession(token: string | undefined | null, secret: string): Promise<boolean> {
  if (!token) return false
  const dot = token.indexOf('.')
  if (dot === -1) return false

  const payload = token.slice(0, dot)
  const expiresAt = Number(payload)
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false

  const signatureBytes = hexToBytes(token.slice(dot + 1))
  if (!signatureBytes) return false

  const key = await importHmacKey(secret)
  return crypto.subtle.verify('HMAC', key, signatureBytes, new TextEncoder().encode(payload))
}
