import { expect, test, type Page } from './fixtures'

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
  return page.getByTestId('shopping-list-item').locator('input[type="text"]').evaluateAll((inputs) =>
    inputs.map((input) => (input as HTMLInputElement).value),
  )
}

// The debug panel is collapsed by default (native <details>) — its contents
// stay in the DOM either way, but any button inside needs the panel opened
// first or Playwright's actionability check on .click() fails as "hidden".
async function openDebugPanel(page: Page) {
  await page.getByTestId('debug-panel-toggle').click()
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
/**
 * Matches the app's own de-DE month formatting (formatMonth/monthKey in
 * src/lib/formatDate.ts). Trips saved without an explicit setTripDate() call
 * default to today's date, so any assertion about "the current month" must
 * be derived from the real clock instead of a hardcoded string/key — a
 * hardcoded "Juli 2026" only holds for as long as the suite happens to run
 * in July 2026, and silently breaks on every month rollover.
 */
function currentMonthLabel(): string {
  return new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' }).format(new Date())
}

function currentMonthKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

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
  await openDebugPanel(page)

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

  await expect(page.getByTestId('history-month-header')).toHaveText([currentMonthLabel(), 'Juni 2026', 'Mai 2026'])
  await expect(page.getByTestId('history-trip')).toHaveCount(3)

  const julyGroup = page.locator(`[data-testid="history-month-group"][data-month-key="${currentMonthKey()}"]`)
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
  await openDebugPanel(page)
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

async function seedTrips(page: Page, count: number) {
  for (let i = 0; i < count; i++) {
    await addItem(page, `Item ${i}`)
    await saveAndGetCompletedTripId(page)
  }
}

test('with more than 7 trips, the trip list scrolls internally instead of growing the page', async ({ page }) => {
  await page.goto('/')
  // 8, not some larger round number — the point of this test is the exact
  // boundary (7 fits, 8 doesn't), not "many trips scroll," so it should
  // fail if the scroll container's height is ever off by one row again.
  await seedTrips(page, 8)

  await page.getByTestId('nav-history').click()
  await expect(page.getByTestId('history-page')).toBeVisible()
  // useHistory() is Dexie's useLiveQuery, which returns [] synchronously
  // before its async IndexedDB read resolves — history-page itself renders
  // regardless, so it can become visible while the list is still empty.
  // Wait for the actual rows before measuring scroll dimensions, or a slow
  // enough query (e.g. under parallel-test load) reads scrollHeight/
  // clientHeight as 0/0 on an as-yet-childless container.
  await expect(page.getByTestId('history-trip')).toHaveCount(8)

  const scrollBox = page.getByTestId('history-list-scroll')
  const { scrollHeight, clientHeight } = await scrollBox.evaluate((el) => ({
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
  }))
  expect(scrollHeight).toBeGreaterThan(clientHeight)

  // The page itself must not have grown to accommodate all 12 rows — the
  // footer stays reachable without scrolling the whole page. (Debug tools
  // only renders on the Shopping List tab, not here.)
  await expect(page.getByTestId('app-footer')).toBeInViewport()
})

test('with 7 or fewer trips, the trip list has no internal scrollbar', async ({ page }) => {
  await page.goto('/')
  // Exactly 7, the true boundary — the scroll container's height is sized
  // for precisely 7 rows plus one month header; a smaller trip count like 3
  // wouldn't catch the container being off by even a full row.
  await seedTrips(page, 7)

  await page.getByTestId('nav-history').click()
  await expect(page.getByTestId('history-page')).toBeVisible()
  // See the comment in the test above — wait for the live-query-backed rows
  // to actually render before measuring, not just the (always-present)
  // page shell.
  await expect(page.getByTestId('history-trip')).toHaveCount(7)

  const scrollBox = page.getByTestId('history-list-scroll')
  const { scrollHeight, clientHeight } = await scrollBox.evaluate((el) => ({
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
  }))
  expect(scrollHeight).toBeLessThanOrEqual(clientHeight)
})

test('the pinned month header updates as trips from an earlier month scroll into view', async ({ page }) => {
  await page.goto('/')
  // June needs enough of its own trips that its group alone is taller than
  // the scroll container — otherwise the total scrollable distance never
  // exceeds July's group height, and there's no scroll position from which
  // July's header (still correctly sticky-pinned until its whole group has
  // scrolled past) could ever be evicted, regardless of how the test
  // scrolls. Confirmed live: with only 5 June trips this test cannot pass
  // no matter how far it scrolls, because the container simply can't
  // scroll far enough — not a bug in the sticky behavior itself.
  for (let i = 0; i < 6; i++) {
    await addItem(page, `July item ${i}`)
    await saveAndGetCompletedTripId(page)
  }
  for (let i = 0; i < 12; i++) {
    await addItem(page, `June item ${i}`)
    const tripId = await saveAndGetCompletedTripId(page)
    await setTripDate(page, tripId, '2026-06-15')
  }

  await page.reload()
  await page.getByTestId('nav-history').click()
  await expect(page.getByTestId('history-month-header')).toHaveText([currentMonthLabel(), 'Juni 2026'])

  // The "current" header is the topmost one whose group hasn't fully
  // scrolled past yet (bottom still below the container's top edge) — at
  // rest that's just whichever header is first in the list; once its whole
  // group scrolls past, position: sticky keeps the *next* header pinned at
  // the container's top edge instead, so it becomes the one satisfying this.
  const stuckHeaderText = () =>
    page.evaluate(() => {
      const containerTop = document.querySelector('[data-testid="history-list-scroll"]')!.getBoundingClientRect().top
      const headers = Array.from(document.querySelectorAll('[data-testid="history-month-header"]'))
      const current = headers.find((h) => h.getBoundingClientRect().bottom > containerTop)
      return current?.textContent
    })

  // At rest, July (the first, most-recent group) is pinned.
  await expect.poll(stuckHeaderText).toBe(currentMonthLabel())

  // Scroll well past the measured height of July's whole group (header +
  // all its rows), not just barely past it: right at that exact boundary,
  // July's header is still mid-handoff — clipped above the container's top
  // edge but with a couple of its own pixels still poking below it, while
  // June's header hasn't reached the top edge yet either (confirmed live by
  // sampling rects frame-by-frame at the boundary) — so neither header
  // reads as "current" for a few pixels of scroll. A comfortable margin
  // (well past one header's own height) clears that handoff zone entirely.
  const julyGroupHeight = await page
    .locator(`[data-testid="history-month-group"][data-month-key="${currentMonthKey()}"]`)
    .evaluate((el) => el.getBoundingClientRect().height)
  await page.getByTestId('history-list-scroll').evaluate((el, distance) => {
    el.scrollTop = distance
  }, julyGroupHeight + 40)
  await expect.poll(stuckHeaderText).toBe('Juni 2026')
})
