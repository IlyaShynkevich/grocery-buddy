import { test, expect } from '@playwright/test'
import middleware from '../middleware'

// middleware.ts uses only standard Web APIs (Request/Response/URL/Web
// Crypto) plus @vercel/edge's next() helper — none of that requires an
// actual Edge runtime to execute, so it can be called directly here in
// Node, same technique auth-session.spec.ts uses for api/_lib/auth.ts.
// This is the only way to exercise middleware.ts's routing logic at all:
// it doesn't run under `vite preview`, so nothing in the rest of the e2e
// suite (which runs against `vite preview`) ever invokes it.

const PASSED_THROUGH_HEADER = 'x-middleware-next'

async function run(pathname: string, appPassword = 'correct-horse-battery-staple') {
  const previous = process.env.APP_PASSWORD
  process.env.APP_PASSWORD = appPassword
  try {
    return await middleware(new Request(`https://example.com${pathname}`))
  } finally {
    process.env.APP_PASSWORD = previous
  }
}

test('an unauthenticated request for a mascot image passes through instead of being redirected', async () => {
  const response = await run('/mascot/idle.png')
  expect(response?.headers.get(PASSED_THROUGH_HEADER)).toBe('1')
})

test('an unauthenticated request for the app shell is still redirected to the login page', async () => {
  const response = await run('/')
  expect(response?.status).toBe(307)
  expect(response?.headers.get('location')).toContain('/login.html')
})

test('an unauthenticated request for the API is still rejected with 401, not passed through', async () => {
  const response = await run('/api/extract-receipt')
  expect(response?.status).toBe(401)
})
