import { expect, test, type Page } from '@playwright/test'

// Same 1x1 PNG fixture used in the other receipt specs.
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

function categoryBar(page: Page, key: string) {
  return page.locator(`[data-testid="stats-category-bar"][data-category-key="${key}"]`)
}

test('stats show correct spend per category for a month with known items', async ({ page }) => {
  await captureAndProcess(page, [
    { name: 'Milk', price: 3.0, category: 'dairy', isDiscount: false },
    { name: 'Bread', price: 2.0, category: 'bakery', isDiscount: false },
    { name: 'Chips', price: 1.5, category: 'snacks', isDiscount: false },
  ])
  await saveTrip(page)

  await page.getByTestId('nav-stats').click()
  await expect(page.getByTestId('stats-page')).toBeVisible()

  // Only one month has data, so it's auto-selected without needing a click.
  await expect(page.getByTestId('stats-month-select')).toHaveCount(1)
  await expect(page.getByTestId('stats-total')).toContainText('6,50')

  const bars = page.getByTestId('stats-category-bar')
  await expect(bars).toHaveCount(3)

  // Sorted by amount descending: dairy (3.00) > bakery (2.00) > snacks (1.50).
  await expect(bars.nth(0)).toHaveAttribute('data-category-key', 'dairy')
  await expect(bars.nth(1)).toHaveAttribute('data-category-key', 'bakery')
  await expect(bars.nth(2)).toHaveAttribute('data-category-key', 'snacks')

  await expect(categoryBar(page, 'dairy').getByTestId('stats-category-amount')).toContainText('3,00')
  await expect(categoryBar(page, 'bakery').getByTestId('stats-category-amount')).toContainText('2,00')
  await expect(categoryBar(page, 'snacks').getByTestId('stats-category-amount')).toContainText('1,50')
})

test('stats show the correct essential vs. non-essential split', async ({ page }) => {
  await captureAndProcess(page, [
    // Essential categories (produce, dairy default to essential): 4.00 + 3.00 = 7.00
    { name: 'Apples', price: 4.0, category: 'produce', isDiscount: false },
    { name: 'Milk', price: 3.0, category: 'dairy', isDiscount: false },
    // Non-essential categories (snacks, drinks default to non-essential): 1.5 + 2.5 = 4.00
    { name: 'Chips', price: 1.5, category: 'snacks', isDiscount: false },
    { name: 'Soda', price: 2.5, category: 'drinks', isDiscount: false },
  ])
  await saveTrip(page)

  await page.getByTestId('nav-stats').click()
  await expect(page.getByTestId('stats-page')).toBeVisible()

  await expect(page.getByTestId('stats-split-essential-amount')).toContainText('7,00')
  await expect(page.getByTestId('stats-split-non-essential-amount')).toContainText('4,00')
})

test('discount entries reduce the total but do not inflate category or essential/non-essential totals', async ({
  page,
}) => {
  await captureAndProcess(page, [
    { name: 'Milk', price: 3.0, category: 'dairy', isDiscount: false },
    { name: 'Chips', price: 1.5, category: 'snacks', isDiscount: false },
    { name: 'Coupon', price: -1.0, category: 'other', isDiscount: true },
  ])
  await saveTrip(page)

  await page.getByTestId('nav-stats').click()
  await expect(page.getByTestId('stats-page')).toBeVisible()

  // Total nets the discount out: 3.00 + 1.50 - 1.00 = 3.50.
  await expect(page.getByTestId('stats-total')).toContainText('3,50')

  // But the discount contributes to neither the category breakdown...
  await expect(page.getByTestId('stats-category-bar')).toHaveCount(2)
  await expect(categoryBar(page, 'dairy').getByTestId('stats-category-amount')).toContainText('3,00')
  await expect(categoryBar(page, 'snacks').getByTestId('stats-category-amount')).toContainText('1,50')
  await expect(categoryBar(page, 'other')).toHaveCount(0)

  // ...nor the essential/non-essential split — dairy is essential (3.00),
  // snacks is non-essential (1.50), neither reduced by the -1.00 discount.
  await expect(page.getByTestId('stats-split-essential-amount')).toContainText('3,00')
  await expect(page.getByTestId('stats-split-non-essential-amount')).toContainText('1,50')
})

test('stats show an empty state when there are no completed trips yet', async ({ page }) => {
  await page.goto('/')

  await page.getByTestId('nav-stats').click()
  await expect(page.getByTestId('stats-page')).toBeVisible()

  await expect(page.getByTestId('stats-empty')).toBeVisible()
  await expect(page.getByTestId('stats-month-select')).toHaveCount(0)
  await expect(page.getByTestId('stats-category-chart')).toHaveCount(0)
  await expect(page.getByTestId('stats-essential-split')).toHaveCount(0)
})
