// Deliberately importing straight from @playwright/test, not ./fixtures —
// login.html is a standalone static page outside the SPA entirely, so the
// homeSeenThisSession seeding other specs rely on doesn't apply here.
import { test, expect } from '@playwright/test'

// middleware.ts (Vercel Edge Middleware) doesn't run under `vite preview`
// (see CLAUDE.md/the deployment plan), so these specs can only exercise
// login.html's own client-side behavior against a mocked /api/login — same
// page.route mocking pattern the receipt-capture specs already use for
// /api/extract-receipt. The actual server-side gate (middleware redirecting
// unauthenticated requests, api/login.ts issuing a real cookie) is verified
// manually against a real Preview deployment instead.

test('an incorrect password shows an inline error and does not navigate away', async ({ page }) => {
  await page.route('**/api/login', (route) =>
    route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'Incorrect password' }) }),
  )

  await page.goto('/login.html')
  await page.getByTestId('login-password').fill('wrong-password')
  await page.getByTestId('login-submit').click()

  await expect(page.getByTestId('login-error')).toHaveText('Incorrect password')
  await expect(page).toHaveURL(/login\.html/)
})

test('a correct password redirects to / by default', async ({ page }) => {
  await page.route('**/api/login', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }),
  )

  await page.goto('/login.html')
  await page.getByTestId('login-password').fill('correct-password')
  await page.getByTestId('login-submit').click()

  await expect(page).toHaveURL(/\/$/)
})

test('a correct password redirects to the ?next= path when present', async ({ page }) => {
  await page.route('**/api/login', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }),
  )

  await page.goto('/login.html?next=%2Fabout')
  await page.getByTestId('login-password').fill('correct-password')
  await page.getByTestId('login-submit').click()

  await expect(page).toHaveURL(/\/about$/)
})

test('an unsafe ?next= (protocol-relative URL) is ignored, falling back to /', async ({ page }) => {
  await page.route('**/api/login', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }),
  )

  await page.goto('/login.html?next=%2F%2Fevil.example.com')
  await page.getByTestId('login-password').fill('correct-password')
  await page.getByTestId('login-submit').click()

  await expect(page).toHaveURL(/\/$/)
})

test('a connection failure shows a friendly error instead of hanging', async ({ page }) => {
  await page.route('**/api/login', (route) => route.abort('failed'))

  await page.goto('/login.html')
  await page.getByTestId('login-password').fill('anything')
  await page.getByTestId('login-submit').click()

  await expect(page.getByTestId('login-error')).toHaveText('Connection issue — try again.')
})
