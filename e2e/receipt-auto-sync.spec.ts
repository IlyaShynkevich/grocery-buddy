import { expect, test } from '@playwright/test'

// Same 1x1 PNG fixture used in the other receipt specs.
const SAMPLE_IMAGE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

async function captureReceipt(page: import('@playwright/test').Page, name: string) {
  await page.getByTestId('receipt-capture-input').setInputFiles({
    name,
    mimeType: 'image/png',
    buffer: SAMPLE_IMAGE,
  })
}

test('a receipt queued while offline is processed automatically once back online, no click needed', async ({
  page,
  context,
}) => {
  await page.route('**/api/extract-receipt', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [{ name: 'Milk', price: 3.49, category: 'dairy' }] }),
    }),
  )

  await page.goto('/')
  // Let the service worker finish precaching before cutting the network —
  // same reasoning as the offline-capture test in receipt-capture.spec.ts.
  await page.evaluate(() => navigator.serviceWorker.ready)

  await context.setOffline(true)

  await captureReceipt(page, 'offline-receipt.png')
  await expect(page.getByTestId('receipt-item')).toHaveCount(1)
  await expect(page.getByTestId('receipt-status').first()).toHaveText('Waiting to process')

  // Nothing should happen while still offline — no manual click, no fetch.
  await page.waitForTimeout(500)
  await expect(page.getByTestId('receipt-status').first()).toHaveText('Waiting to process')

  await context.setOffline(false)
  // Playwright's setOffline doesn't fire the browser's 'online' event on
  // its own — dispatch it directly, same as a real browser would when the
  // OS reports connectivity restored.
  await page.evaluate(() => window.dispatchEvent(new Event('online')))

  await expect(page.getByTestId('receipt-status').first()).toHaveText('Processed', { timeout: 5000 })
  await expect(page.getByTestId('receipt-process-button')).toHaveCount(0)
})

test('multiple pending receipts sync one at a time on reconnect, not simultaneously', async ({
  page,
  context,
}) => {
  const inFlight: string[] = []
  let maxConcurrent = 0

  await page.route('**/api/extract-receipt', async (route) => {
    const id = Math.random().toString(36)
    inFlight.push(id)
    maxConcurrent = Math.max(maxConcurrent, inFlight.length)
    await new Promise((resolve) => setTimeout(resolve, 200))
    inFlight.splice(inFlight.indexOf(id), 1)
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [{ name: 'Item', price: 1, category: 'other' }] }),
    })
  })

  await page.goto('/')
  await page.evaluate(() => navigator.serviceWorker.ready)

  await context.setOffline(true)
  await captureReceipt(page, 'offline-1.png')
  await captureReceipt(page, 'offline-2.png')
  await context.setOffline(false)

  await expect(page.getByTestId('receipt-item')).toHaveCount(2)

  await page.evaluate(() => window.dispatchEvent(new Event('online')))

  await expect
    .poll(() => page.getByTestId('receipt-status').allTextContents())
    .toEqual(['Processed', 'Processed'])

  expect(maxConcurrent).toBe(1)
})

test('a failed receipt (no rate-limit wait parsed) is retried automatically on reconnect', async ({ page }) => {
  let callCount = 0
  await page.route('**/api/extract-receipt', (route) => {
    callCount += 1
    if (callCount === 1) {
      return route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'OpenAI returned 500: server exploded' }),
      })
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [{ name: 'Eggs', price: 4.2, category: 'dairy' }] }),
    })
  })

  await page.goto('/')
  await captureReceipt(page, 'receipt.png')
  await page.getByTestId('receipt-process-button').click()

  await expect(page.getByTestId('receipt-status').first()).toHaveText('Failed — will retry')
  expect(callCount).toBe(1)

  // Simulate a genuine drop + reconnect (not the offline flag — the failed
  // attempt already happened while nominally online, e.g. a flaky network).
  await page.evaluate(() => window.dispatchEvent(new Event('online')))

  await expect(page.getByTestId('receipt-status').first()).toHaveText('Processed', { timeout: 5000 })
  expect(callCount).toBe(2)
})

test('a rate-limited receipt with a pending auto-retry is not retried early by a reconnect sweep', async ({
  page,
}) => {
  let callCount = 0
  await page.route('**/api/extract-receipt', (route) => {
    callCount += 1
    if (callCount === 1) {
      return route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'OpenAI returned 429: {"error":{"message":"Rate limit reached. Please try again in 2s."}}',
        }),
      })
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [{ name: 'Eggs', price: 4.2, category: 'dairy' }] }),
    })
  })

  await page.goto('/')
  await captureReceipt(page, 'receipt.png')
  await page.getByTestId('receipt-process-button').click()

  await expect(page.getByTestId('receipt-status').first()).toHaveText(/Retrying in \d+s/)
  expect(callCount).toBe(1)

  // Flaky connectivity firing 'online' repeatedly (the same event the
  // auto-sync sweep listens for) must not re-trigger the request before the
  // parsed rate-limit wait has actually elapsed — that would just hit the
  // same rate limit again instead of letting it clear.
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await page.waitForTimeout(300)
  expect(callCount).toBe(1)
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await page.waitForTimeout(300)
  expect(callCount).toBe(1)

  // Once the wait genuinely elapses, the (unbypassed) row-level auto-retry
  // still fires on its own.
  await expect(page.getByTestId('receipt-status').first()).toHaveText('Processed', { timeout: 5000 })
  expect(callCount).toBe(2)
})
