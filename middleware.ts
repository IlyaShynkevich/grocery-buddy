import { next } from '@vercel/edge'
import { AUTH_COOKIE_NAME, verifySession } from './api/_lib/auth.js'

// No `config.matcher` export — Vercel Edge Middleware runs on every request
// to this project by default when matcher is omitted, which is exactly what
// this needs: the gate has to cover every route (static assets, the SPA
// shell, and api/extract-receipt) except the two paths carved out below, not
// a hand-picked subset.

function getCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get('cookie')
  if (!header) return undefined
  for (const part of header.split(';')) {
    const separator = part.indexOf('=')
    if (separator === -1) continue
    if (part.slice(0, separator).trim() === name) return part.slice(separator + 1).trim()
  }
  return undefined
}

export default async function middleware(request: Request) {
  const appPassword = process.env.APP_PASSWORD
  // Unset on the public demo deployment (and on Production before it's
  // configured) — same "env var absence turns the feature off entirely"
  // convention api/extract-receipt.ts already uses for OPENAI_API_KEY, so
  // the demo stays byte-for-byte as open as it is today.
  if (!appPassword) return next()

  const url = new URL(request.url)
  // /mascot/* is decorative art the login page itself needs to render
  // (public/login.html's <img src="/mascot/idle.png">) — without this,
  // that request gets 307-redirected to /login.html same as any other
  // unauthenticated path, and the browser renders that HTML response as a
  // broken image since it asked for one. No security concern in serving
  // these to a logged-out visitor: static, non-secret art, same rationale
  // already applied to /login.html and /api/login below.
  if (url.pathname === '/login.html' || url.pathname === '/api/login' || url.pathname.startsWith('/mascot/')) {
    return next()
  }

  if (await verifySession(getCookie(request, AUTH_COOKIE_NAME), appPassword)) return next()

  if (url.pathname.startsWith('/api/')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    })
  }

  const redirectUrl = new URL('/login.html', url)
  redirectUrl.searchParams.set('next', url.pathname + url.search)
  return Response.redirect(redirectUrl, 307)
}
