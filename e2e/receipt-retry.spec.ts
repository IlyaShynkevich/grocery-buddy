import { expect, test, type Page } from '@playwright/test'

// Same 1x1 PNG fixture used in the other receipt specs.
const SAMPLE_IMAGE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

async function captureReceipt(page: Page) {
  await page.getByTestId('receipt-capture-input').setInputFiles({
    name: 'receipt.png',
    mimeType: 'image/png',
    buffer: SAMPLE_IMAGE,
  })
  await expect(page.getByTestId('receipt-item')).toHaveCount(1)
}

/** Mimics the shape of the real Groq 429 message our server forwards as `error`. */
function rateLimitError(seconds: number) {
  return JSON.stringify({
    error: `Groq returned 429: {"error":{"message":"Rate limit reached for model \`qwen/qwen3.6-27b\`. Please try again in ${seconds}s. Need more tokens?"}}`,
  })
}

test('auto-retries after the parsed rate-limit wait, with no manual interaction', async ({ page }) => {
  let callCount = 0
  await page.route('**/api/extract-receipt', (route) => {
    callCount += 1
    if (callCount === 1) {
      return route.fulfill({ status: 502, contentType: 'application/json', body: rateLimitError(1) })
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [{ name: 'Milk', price: 3.49, category: 'dairy' }] }),
    })
  })

  await page.goto('/')
  await captureReceipt(page)
  await page.getByTestId('receipt-process-button').click()

  await expect(page.getByTestId('receipt-status').first()).toHaveText(/Retrying in \d+s/)
  // manual Retry stays available throughout the wait
  await expect(page.getByTestId('receipt-process-button')).toHaveText('Retry')

  // no click here — the retry must fire on its own once the wait elapses
  await expect(page.getByTestId('receipt-status').first()).toHaveText('Processed', { timeout: 5000 })
  expect(callCount).toBe(2)
})

test('repeats the parse-and-wait loop if the auto-retry itself hits another 429', async ({ page }) => {
  let callCount = 0
  await page.route('**/api/extract-receipt', (route) => {
    callCount += 1
    if (callCount <= 2) {
      return route.fulfill({ status: 502, contentType: 'application/json', body: rateLimitError(1) })
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [{ name: 'Eggs', price: 4.2, category: 'dairy' }] }),
    })
  })

  await page.goto('/')
  await captureReceipt(page)
  await page.getByTestId('receipt-process-button').click()

  await expect(page.getByTestId('receipt-status').first()).toHaveText(/Retrying in \d+s/)
  // still retrying (not given up) after the first auto-retry fails again
  await expect(page.getByTestId('receipt-status').first()).toHaveText(/Retrying in \d+s/, { timeout: 3000 })

  await expect(page.getByTestId('receipt-status').first()).toHaveText('Processed', { timeout: 5000 })
  expect(callCount).toBe(3)
})

test('manual Retry works immediately and bypasses the countdown', async ({ page }) => {
  let callCount = 0
  await page.route('**/api/extract-receipt', (route) => {
    callCount += 1
    if (callCount === 1) {
      return route.fulfill({ status: 502, contentType: 'application/json', body: rateLimitError(30) })
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [{ name: 'Bread', price: 2.49, category: 'bakery' }] }),
    })
  })

  await page.goto('/')
  await captureReceipt(page)
  await page.getByTestId('receipt-process-button').click()

  await expect(page.getByTestId('receipt-status').first()).toHaveText(/Retrying in \d+s/)

  await page.getByTestId('receipt-process-button').click()

  // succeeds well within the (unwaited) 30s window, proving manual retry bypassed it
  await expect(page.getByTestId('receipt-status').first()).toHaveText('Processed', { timeout: 5000 })
  expect(callCount).toBe(2)
})

test('an unrecognized 429 message falls back to manual-retry-only, no countdown', async ({ page }) => {
  await page.route('**/api/extract-receipt', (route) =>
    route.fulfill({
      status: 502,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Groq returned 429: rate limited, please slow down' }),
    }),
  )

  await page.goto('/')
  await captureReceipt(page)
  await page.getByTestId('receipt-process-button').click()

  await expect(page.getByTestId('receipt-status').first()).toHaveText('Failed — will retry')

  // give it time to prove no auto-retry ever fires without a parsed wait
  await page.waitForTimeout(1500)
  await expect(page.getByTestId('receipt-status').first()).toHaveText('Failed — will retry')
  await expect(page.getByTestId('receipt-process-button')).toHaveText('Retry')
})
