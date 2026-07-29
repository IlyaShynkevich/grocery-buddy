import { expect, test, type Page } from '@playwright/test'

// Same 1x1 PNG fixture used in e2e/receipt-capture.spec.ts.
const SAMPLE_IMAGE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

// The preview build (npm run preview) serves static files only — there's no
// live serverless function to hit. These tests mock /api/extract-receipt at
// the network layer so the *client* wiring (status transitions, item
// creation, error display, retry) is exercised end-to-end. Groq call
// quality and the server-side error/timeout handling are covered
// separately: real extraction was verified manually against a synthetic
// receipt photo, and error paths (429, 400, timeout, garbage JSON) are
// covered by a standalone script against api/_lib/groqExtract.ts.

async function captureReceipt(page: Page) {
  await page.getByTestId('receipt-capture-input').setInputFiles({
    name: 'receipt.png',
    mimeType: 'image/png',
    buffer: SAMPLE_IMAGE,
  })
  await expect(page.getByTestId('receipt-item')).toHaveCount(1)
}

async function itemNames(page: Page): Promise<string[]> {
  const inputs = await page.getByTestId('shopping-list-item').locator('input[type="text"]').all()
  return Promise.all(inputs.map((input) => input.inputValue()))
}

test('successful extraction adds items to the shopping list and marks the receipt processed', async ({
  page,
}) => {
  await page.route('**/api/extract-receipt', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          { name: 'Milk', price: 3.49, category: 'dairy' },
          { name: 'Bread', price: 2.49, category: 'bakery' },
        ],
      }),
    }),
  )

  await page.goto('/')
  await captureReceipt(page)

  await page.getByTestId('receipt-process-button').click()

  await expect(page.getByTestId('receipt-status').first()).toHaveText('Processed')
  await expect(page.getByTestId('receipt-process-button')).toHaveCount(0)
  await expect.poll(() => itemNames(page)).toEqual(['Milk', 'Bread'])
})

test('a server error marks the receipt failed, shows the message, and allows retry', async ({ page }) => {
  let callCount = 0
  await page.route('**/api/extract-receipt', (route) => {
    callCount += 1
    if (callCount === 1) {
      return route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Groq returned 429: rate limited, try again later' }),
      })
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

  await expect(page.getByTestId('receipt-status').first()).toHaveText('Failed — will retry')
  await expect(page.getByTestId('receipt-error')).toContainText('rate limited')
  await expect(page.getByTestId('receipt-process-button')).toHaveText('Retry')

  // no items should have been added from the failed attempt
  await expect.poll(() => itemNames(page)).toEqual([])

  await page.getByTestId('receipt-process-button').click()

  await expect(page.getByTestId('receipt-status').first()).toHaveText('Processed')
  await expect.poll(() => itemNames(page)).toEqual(['Eggs'])
})

test('a malformed response (garbage body) is treated as a failure, not a crash', async ({ page }) => {
  await page.route('**/api/extract-receipt', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"unexpected": true}' }),
  )

  await page.goto('/')
  await captureReceipt(page)

  await page.getByTestId('receipt-process-button').click()

  await expect(page.getByTestId('receipt-status').first()).toHaveText('Failed — will retry')
  await expect(page.getByTestId('receipt-error')).toContainText('malformed')
})

test('a network-level failure (e.g. offline mid-request) is treated as a failure, not a crash', async ({
  page,
}) => {
  await page.route('**/api/extract-receipt', (route) => route.abort('failed'))

  await page.goto('/')
  await captureReceipt(page)

  await page.getByTestId('receipt-process-button').click()

  await expect(page.getByTestId('receipt-status').first()).toHaveText('Failed — will retry')
  await expect(page.getByTestId('receipt-error')).not.toBeEmpty()
})
