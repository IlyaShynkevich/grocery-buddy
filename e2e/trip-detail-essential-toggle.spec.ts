import { expect, test, type Page } from './fixtures'

// Same 1x1 PNG fixture used across the other receipt specs.
const SAMPLE_IMAGE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

async function captureAndProcess(page: Page, items: Array<Record<string, unknown>>) {
  await page.route('**/api/extract-receipt', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items }) }),
  )
  await page.goto('/')
  await page.getByTestId('receipt-capture-input').setInputFiles({
    name: 'receipt.png',
    mimeType: 'image/png',
    buffer: SAMPLE_IMAGE,
  })
  await page.getByTestId('receipt-process-button').click()
  await expect(page.getByTestId('receipt-status').first()).toHaveText('Processed')
  await page.getByTestId('receipt-review-confirm').click()
}

async function saveTrip(page: Page) {
  const tripId = await page.getByTestId('shopping-list').getAttribute('data-trip-id')
  await page.getByTestId('save-trip-button').click()
  await expect.poll(() => page.getByTestId('shopping-list').getAttribute('data-trip-id')).not.toBe(tripId)
}

test('tapping the essential badge on trip detail toggles it, and Stats reflects the change afterward', async ({
  page,
}) => {
  await captureAndProcess(page, [
    // produce defaults to essential.
    { name: 'Apples', price: 4.0, category: 'produce', isDiscount: false },
    // snacks defaults to non-essential.
    { name: 'Chips', price: 1.5, category: 'snacks', isDiscount: false },
  ])
  await saveTrip(page)

  await page.getByTestId('nav-history').click()
  await page.getByTestId('history-trip').click()
  await expect(page.getByTestId('trip-detail-page')).toBeVisible()

  const applesRow = page.locator('[data-testid="trip-detail-item"]', { hasText: 'Apples' })
  const badge = applesRow.getByTestId('trip-detail-item-essential')

  await expect(badge).toHaveText('essential')
  await expect(badge).toHaveAttribute('data-essential', 'true')

  // Tap toggles the resolved status's literal opposite, updating immediately.
  await badge.click()
  await expect(badge).toHaveText('non-essential')
  await expect(badge).toHaveAttribute('data-essential', 'false')

  // Tapping again flips it straight back (not a 3-state cycle through "default").
  await badge.click()
  await expect(badge).toHaveText('essential')
  await expect(badge).toHaveAttribute('data-essential', 'true')

  // Leave it toggled to non-essential before checking Stats.
  await badge.click()
  await expect(badge).toHaveText('non-essential')

  await page.getByTestId('nav-stats').click()
  await expect(page.getByTestId('stats-page')).toBeVisible()

  // Apples (4.00) moved out of essential into non-essential, alongside Chips
  // (1.50): essential 0.00, non-essential 5.50.
  await expect(page.getByTestId('stats-split-essential-amount')).toContainText('0,00')
  await expect(page.getByTestId('stats-split-non-essential-amount')).toContainText('5,50')
})
