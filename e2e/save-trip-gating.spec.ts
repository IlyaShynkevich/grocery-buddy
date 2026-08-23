import { expect, test, type Page } from './fixtures'

// Same 1x1 PNG fixture used across the other receipt specs.
const SAMPLE_IMAGE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

async function captureAndProcess(page: Page) {
  await page.route('**/api/extract-receipt', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [{ name: 'Milk', price: 3.49, category: 'dairy' }] }),
    }),
  )
  await page.getByTestId('receipt-capture-input').setInputFiles({
    name: 'receipt.png',
    mimeType: 'image/png',
    buffer: SAMPLE_IMAGE,
  })
  await page.getByTestId('receipt-process-button').click()
  await expect(page.getByTestId('receipt-status').first()).toHaveText('Processed')
}

test('Save trip is disabled with a visible explanation while a scan is unconfirmed, and clicking it is a no-op', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.getByTestId('save-trip-button')).toBeEnabled()
  await expect(page.getByTestId('save-trip-disabled-hint')).toHaveCount(0)

  const tripId = await page.getByTestId('shopping-list').getAttribute('data-trip-id')
  await captureAndProcess(page)

  await expect(page.getByTestId('save-trip-button')).toBeDisabled()
  // Not just greyed out with no explanation — a visible hint, not only a
  // hover-only title (this is a mobile-first app; hover tooltips don't work
  // on touch).
  await expect(page.getByTestId('save-trip-disabled-hint')).toBeVisible()
  await expect(page.getByTestId('save-trip-disabled-hint')).toContainText('review')

  // A disabled native <button> doesn't dispatch click at all — confirm nothing happens.
  await page.getByTestId('save-trip-button').click({ force: true })
  await page.waitForTimeout(200)
  expect(await page.getByTestId('shopping-list').getAttribute('data-trip-id')).toBe(tripId)
})

test('Save trip re-enables once the review is confirmed', async ({ page }) => {
  await page.goto('/')
  await captureAndProcess(page)
  await expect(page.getByTestId('save-trip-button')).toBeDisabled()

  await page.getByTestId('receipt-review-confirm').click()

  await expect(page.getByTestId('save-trip-button')).toBeEnabled()
  await expect(page.getByTestId('save-trip-disabled-hint')).toHaveCount(0)
})

test('Save trip re-enables once the review is dismissed (discarding the scan)', async ({ page }) => {
  await page.goto('/')
  await captureAndProcess(page)
  await expect(page.getByTestId('save-trip-button')).toBeDisabled()

  await page.getByTestId('receipt-review-dismiss').click()

  await expect(page.getByTestId('save-trip-button')).toBeEnabled()
  await expect(page.getByTestId('save-trip-disabled-hint')).toHaveCount(0)
})
