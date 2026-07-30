import { expect, test, type Page } from '@playwright/test'

// Same 1x1 PNG fixture used in the other receipt specs.
const SAMPLE_IMAGE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

async function addItem(page: Page, name: string) {
  await page.getByTestId('add-item-input').fill(name)
  await page.getByTestId('add-item-submit').click()
  await expect(page.getByTestId('shopping-list-item').last().locator('input[type="text"]')).toHaveValue(name)
}

async function itemNames(page: Page): Promise<string[]> {
  const inputs = await page.getByTestId('shopping-list-item').locator('input[type="text"]').all()
  return Promise.all(inputs.map((input) => input.inputValue()))
}

/** Saves the active trip and returns the id of the trip that was just completed. */
async function saveAndGetCompletedTripId(page: Page): Promise<string> {
  const tripId = await page.getByTestId('shopping-list').getAttribute('data-trip-id')
  await page.getByTestId('save-trip-button').click()
  await expect.poll(() => page.getByTestId('shopping-list').getAttribute('data-trip-id')).not.toBe(tripId)
  return tripId ?? ''
}

/**
 * Backdates a completed trip's shopping date directly in IndexedDB — there's
 * no UI for this (trips are always dated "today" on creation), but grouping
 * by month can't be exercised with only same-day trips. Raw IndexedDB is
 * used rather than going through Dexie because Dexie's liveQuery reactivity
 * is driven by its own transaction hooks, which a page-context write
 * wouldn't fire anyway — callers reload the page afterwards regardless.
 */
async function setTripDate(page: Page, tripId: string, isoDate: string) {
  await page.evaluate(
    ({ tripId, isoDate }) => {
      return new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('grocery-buddy')
        req.onerror = () => reject(req.error)
        req.onsuccess = () => {
          const idb = req.result
          const tx = idb.transaction('trips', 'readwrite')
          const store = tx.objectStore('trips')
          const getReq = store.get(Number(tripId))
          getReq.onsuccess = () => {
            const trip = getReq.result
            trip.date = isoDate
            store.put(trip)
          }
          tx.oncomplete = () => {
            idb.close()
            resolve()
          }
          tx.onerror = () => reject(tx.error)
        }
      })
    },
    { tripId, isoDate },
  )
}

test('trip detail shows each item\'s resolved essential/non-essential status, including a manual override', async ({
  page,
}) => {
  await page.goto('/')

  await addItem(page, 'Bread')
  await addItem(page, 'Chips')

  // Both default to category "other" (essential by default) — override
  // Chips to non-essential via the debug panel before saving, so the trip
  // has one default-essential item and one explicitly-overridden item.
  const activeTripDiv = page.locator('[data-testid="debug-trip"][data-active="true"]')
  const chipsRow = activeTripDiv.locator('[data-testid="debug-item"]', { hasText: 'Chips' })
  await chipsRow.getByTestId('debug-item-essential-toggle').click()
  await expect(chipsRow).toContainText('essential: false')
  await expect(chipsRow).toContainText('(overridden)')

  await saveAndGetCompletedTripId(page)

  await page.getByTestId('nav-history').click()
  await page.getByTestId('history-trip').click()
  await expect(page.getByTestId('trip-detail-page')).toBeVisible()

  const breadRow = page.locator('[data-testid="trip-detail-item"]', { hasText: 'Bread' })
  await expect(breadRow.getByTestId('trip-detail-item-essential')).toHaveText('essential')
  await expect(breadRow.getByTestId('trip-detail-item-essential')).toHaveAttribute('data-essential', 'true')

  const chipsDetailRow = page.locator('[data-testid="trip-detail-item"]', { hasText: 'Chips' })
  await expect(chipsDetailRow.getByTestId('trip-detail-item-essential')).toHaveText('non-essential')
  await expect(chipsDetailRow.getByTestId('trip-detail-item-essential')).toHaveAttribute('data-essential', 'false')
})

test('history groups trips by month, most recent month first, and can filter to a single month', async ({
  page,
}) => {
  await page.goto('/')

  await addItem(page, 'July item')
  await saveAndGetCompletedTripId(page)

  await addItem(page, 'June item')
  const juneTripId = await saveAndGetCompletedTripId(page)
  await setTripDate(page, juneTripId, '2026-06-15')

  await addItem(page, 'May item')
  const mayTripId = await saveAndGetCompletedTripId(page)
  await setTripDate(page, mayTripId, '2026-05-01')

  await page.reload()
  await page.getByTestId('nav-history').click()
  await expect(page.getByTestId('history-page')).toBeVisible()

  await expect(page.getByTestId('history-month-header')).toHaveText(['Juli 2026', 'Juni 2026', 'Mai 2026'])
  await expect(page.getByTestId('history-trip')).toHaveCount(3)

  const julyGroup = page.locator('[data-testid="history-month-group"][data-month-key="2026-07"]')
  await expect(julyGroup.getByTestId('history-trip')).toHaveCount(1)
  await expect(julyGroup.getByTestId('history-trip')).toContainText('1 item')

  // Filter down to a single month.
  await page.getByTestId('history-month-select').selectOption({ label: 'Juni 2026' })

  await expect(page.getByTestId('history-month-group')).toHaveCount(1)
  await expect(page.getByTestId('history-month-header')).toHaveText('Juni 2026')
  const visibleTrips = page.getByTestId('history-trip')
  await expect(visibleTrips).toHaveCount(1)
  await expect(visibleTrips).toContainText('1 item')

  await visibleTrips.click()
  await expect(page.getByTestId('trip-detail-page')).toBeVisible()
  await expect(page.getByTestId('trip-detail-item')).toContainText('June item')
})

test('discount entries no longer show category/essential controls anywhere', async ({ page }) => {
  await page.route('**/api/extract-receipt', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          { name: 'Milk', price: 3.49, category: 'dairy', isDiscount: false },
          { name: 'Coupon Herzstuecke', price: -0.38, category: 'other', isDiscount: true },
        ],
      }),
    }),
  )

  await page.goto('/')
  await page.getByTestId('receipt-capture-input').setInputFiles({
    name: 'receipt.png',
    mimeType: 'image/png',
    buffer: SAMPLE_IMAGE,
  })
  await page.getByTestId('receipt-process-button').click()
  await expect(page.getByTestId('receipt-status').first()).toHaveText('Processed')

  // Never shown as something to buy again (existing behavior, reasserted here).
  await expect.poll(() => itemNames(page)).toEqual(['Milk'])

  // Review panel never shows it as an editable item either.
  await expect(page.getByTestId('receipt-review-item')).toHaveCount(1)
  await expect(page.getByTestId('receipt-review-item')).toContainText('Milk')
  await page.getByTestId('receipt-review-confirm').click()

  // Debug panel: discount line is a plain deduction row with no category
  // dropdown or essential toggle; the regular item still has both.
  const activeTripDiv = page.locator('[data-testid="debug-trip"][data-active="true"]')
  const discountRow = activeTripDiv.getByTestId('debug-discount-item')
  await expect(discountRow).toHaveCount(1)
  await expect(discountRow).toContainText('Coupon Herzstuecke')
  await expect(discountRow.locator('select')).toHaveCount(0)
  await expect(discountRow.getByTestId('debug-item-essential-toggle')).toHaveCount(0)

  const milkRow = activeTripDiv.getByTestId('debug-item')
  await expect(milkRow).toHaveCount(1)
  await expect(milkRow.locator('select')).toHaveCount(1)
  await expect(milkRow.getByTestId('debug-item-essential-toggle')).toHaveCount(1)

  // Trip detail: the discount shows as a deduction line, distinct from
  // regular items, and never gets an essential/non-essential badge.
  await saveAndGetCompletedTripId(page)
  await page.getByTestId('nav-history').click()
  await page.getByTestId('history-trip').click()

  await expect(page.getByTestId('trip-detail-item')).toHaveCount(1)
  await expect(page.getByTestId('trip-detail-item-essential')).toHaveCount(1)

  const detailDiscountRow = page.getByTestId('trip-detail-discount')
  await expect(detailDiscountRow).toHaveCount(1)
  await expect(detailDiscountRow).toContainText('Coupon Herzstuecke')
  await expect(detailDiscountRow.getByTestId('trip-detail-item-essential')).toHaveCount(0)
})
