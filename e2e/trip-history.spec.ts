import { expect, test, type Page } from '@playwright/test'

async function addItem(page: Page, name: string) {
  await page.getByTestId('add-item-input').fill(name)
  await page.getByTestId('add-item-submit').click()
  await expect(page.getByTestId('shopping-list-item').last().locator('input[type="text"]')).toHaveValue(name)
}

async function itemNames(page: Page): Promise<string[]> {
  const inputs = await page.getByTestId('shopping-list-item').locator('input[type="text"]').all()
  return Promise.all(inputs.map((input) => input.inputValue()))
}

test('saving a trip marks it complete and immediately starts a new empty active draft', async ({ page }) => {
  await page.goto('/')

  await addItem(page, 'Milk')
  await addItem(page, 'Eggs')
  const originalTripId = await page.getByTestId('shopping-list').getAttribute('data-trip-id')

  await page.getByTestId('save-trip-button').click()

  // The main shopping list immediately reflects the new draft trip — a
  // different id, no items — without any reload or manual setup.
  await expect.poll(() => page.getByTestId('shopping-list').getAttribute('data-trip-id')).not.toBe(originalTripId)
  await expect.poll(() => itemNames(page)).toEqual([])

  // The old trip is no longer the active one in the debug panel...
  const oldTripRow = page.locator(`[data-testid="debug-trip"][data-trip-id="${originalTripId}"]`)
  await expect(oldTripRow).toHaveAttribute('data-active', 'false')

  // ...and shows up as a completed trip in history, not just "not active".
  await page.getByTestId('nav-history').click()
  const historyTrip = page.getByTestId('history-trip')
  await expect(historyTrip).toHaveCount(1)
  await expect(historyTrip).toHaveAttribute('data-trip-id', originalTripId ?? '')
  await expect(historyTrip).toContainText('2 items')
  await page.getByTestId('nav-shopping').click()

  // A fresh capture goes onto the new trip, proving it's fully usable
  // without any manual setup.
  await addItem(page, 'Bananas')
  await expect.poll(() => itemNames(page)).toEqual(['Bananas'])
})

test('a saved trip appears in the history list, most recently saved first', async ({ page }) => {
  await page.goto('/')

  await addItem(page, 'Milk')
  await page.getByTestId('save-trip-button').click()
  await expect.poll(() => itemNames(page)).toEqual([])

  await addItem(page, 'Bread')
  await addItem(page, 'Butter')
  await page.getByTestId('save-trip-button').click()
  await expect.poll(() => itemNames(page)).toEqual([])

  await page.getByTestId('nav-history').click()
  await expect(page.getByTestId('history-page')).toBeVisible()

  const trips = page.getByTestId('history-trip')
  await expect(trips).toHaveCount(2)

  // Second save (2 items) most recently completed — must sort first even
  // though both trips share the same date, which is why this can't just
  // sort by date.
  await expect(trips.nth(0)).toContainText('2 items')
  await expect(trips.nth(1)).toContainText('1 item')
})

test("a saved trip's items and total are unchanged after saving, and its detail view is read-only", async ({
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

  await page.getByTestId('receipt-capture-input').setInputFiles({
    name: 'receipt.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    ),
  })
  await page.getByTestId('receipt-process-button').click()
  await expect(page.getByTestId('receipt-status').first()).toHaveText('Processed')
  await page.getByTestId('receipt-review-confirm').click()

  await expect.poll(() => itemNames(page)).toEqual(['Milk', 'Bread'])

  await page.getByTestId('save-trip-button').click()
  await expect.poll(() => itemNames(page)).toEqual([])

  await page.getByTestId('nav-history').click()
  const trip = page.getByTestId('history-trip')
  await expect(trip).toHaveCount(1)
  await expect(trip).toContainText('2 items')
  await expect(trip).toContainText('5,98') // 3.49 + 2.49, de-DE formatting

  await trip.click()
  await expect(page.getByTestId('trip-detail-page')).toBeVisible()
  await expect(page.getByTestId('trip-detail-total')).toContainText('5,98')

  const detailItems = page.getByTestId('trip-detail-item')
  await expect(detailItems).toHaveCount(2)
  await expect(detailItems.nth(0)).toContainText('Milk')
  await expect(detailItems.nth(0)).toContainText('3,49')
  await expect(detailItems.nth(1)).toContainText('Bread')
  await expect(detailItems.nth(1)).toContainText('2,49')

  // Read-only: no editable inputs, no remove/edit controls of any kind.
  await expect(page.getByTestId('trip-detail-page').locator('input')).toHaveCount(0)
  await expect(page.getByTestId('trip-detail-page').locator('button[aria-label*="Remove"]')).toHaveCount(0)

  await page.getByTestId('trip-detail-back').click()
  await expect(page.getByTestId('history-page')).toBeVisible()
})
