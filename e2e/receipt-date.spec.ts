import { expect, test, type Page } from './fixtures'

// Same 1x1 PNG fixture used in the other receipt specs.
const SAMPLE_IMAGE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

// Pinned so "the trip's current date" is a known value (a fresh draft is
// always dated today — see newTrip) and can't collide with the receipt date.
const TODAY = new Date('2026-09-18T10:00:00.000Z')
const TODAY_DISPLAY = '18.09.2026'

async function mockExtraction(page: Page, body: Record<string, unknown>) {
  await page.route('**/api/extract-receipt', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [{ name: 'Milk', price: 3.49, category: 'dairy' }], ...body }),
    }),
  )
}

async function captureAndProcess(page: Page) {
  await page.getByTestId('receipt-capture-input').setInputFiles({
    name: 'receipt.png',
    mimeType: 'image/png',
    buffer: SAMPLE_IMAGE,
  })
  await page.getByTestId('receipt-process-button').click()
  await expect(page.getByTestId('receipt-status').first()).toHaveText('Processed')
}

async function saveTripAndOpenHistory(page: Page) {
  await page.getByTestId('save-trip-button').click()
  await page.getByTestId('nav-history').click()
  await expect(page.getByTestId('history-trip')).toHaveCount(1)
}

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: TODAY })
})

test('an extracted date shows in the collapsed review summary and is applied to the trip on Confirm', async ({
  page,
}) => {
  await mockExtraction(page, { purchaseDate: '2026-09-15', purchaseDateError: null })

  await page.goto('/')
  await captureAndProcess(page)

  // Visible without expanding the item list, right alongside the total.
  await expect(page.getByTestId('receipt-review-collapsible')).not.toHaveAttribute('open')
  await expect(page.getByTestId('receipt-review-date')).toHaveText('Date: 15.09.2026')
  await expect(page.getByTestId('receipt-review-date-error')).toHaveCount(0)

  await page.getByTestId('receipt-review-confirm').click()
  await expect(page.getByTestId('receipt-review-panel')).toHaveCount(0)

  // A reload re-resolves the active draft, which refreshes a stale draft
  // date to today — a confirmed receipt date must survive that.
  await page.reload()
  await expect(page.getByTestId('shopping-list')).toBeVisible()

  await saveTripAndOpenHistory(page)
  await expect(page.getByTestId('history-trip')).toContainText('15.09.2026')
})

test('dismissing the review discards the extracted date along with the items', async ({ page }) => {
  await mockExtraction(page, { purchaseDate: '2026-09-15', purchaseDateError: null })

  await page.goto('/')
  await captureAndProcess(page)
  await expect(page.getByTestId('receipt-review-date')).toHaveText('Date: 15.09.2026')

  await page.getByTestId('receipt-review-dismiss').click()
  await expect(page.getByTestId('receipt-review-panel')).toHaveCount(0)

  await saveTripAndOpenHistory(page)
  await expect(page.getByTestId('history-trip')).toContainText(TODAY_DISPLAY)
  await expect(page.getByTestId('history-trip')).not.toContainText('15.09.2026')
})

test("a null date shows the trip's current date as-is and leaves it unchanged on Confirm", async ({ page }) => {
  await mockExtraction(page, { purchaseDate: null, purchaseDateError: null })

  await page.goto('/')
  await captureAndProcess(page)

  await expect(page.getByTestId('receipt-review-date')).toHaveText(`Date: ${TODAY_DISPLAY}`)
  await expect(page.getByTestId('receipt-review-date-error')).toHaveCount(0)

  await page.getByTestId('receipt-review-confirm').click()
  await expect(page.getByTestId('receipt-review-panel')).toHaveCount(0)

  await saveTripAndOpenHistory(page)
  await expect(page.getByTestId('history-trip')).toContainText(TODAY_DISPLAY)
})

test('the user can correct the date in the review panel before confirming', async ({ page }) => {
  await mockExtraction(page, { purchaseDate: '2026-09-15', purchaseDateError: null })

  await page.goto('/')
  await captureAndProcess(page)

  await page.getByTestId('receipt-review-toggle').click()
  const dateInput = page.getByTestId('receipt-review-date-input')
  await expect(dateInput).toHaveValue('2026-09-15')
  await dateInput.fill('2026-09-16')

  // Still staged — the summary reflects the edit, the trip doesn't yet.
  await expect(page.getByTestId('receipt-review-date')).toHaveText('Date: 16.09.2026')

  await page.getByTestId('receipt-review-confirm').click()
  await expect(page.getByTestId('receipt-review-panel')).toHaveCount(0)

  await saveTripAndOpenHistory(page)
  await expect(page.getByTestId('history-trip')).toContainText('16.09.2026')
})

test('an unreadable date is surfaced as an error, not silently dropped, and leaves the trip date unchanged', async ({
  page,
}) => {
  await mockExtraction(page, { purchaseDate: null, purchaseDateError: 'Unrecognized receipt date "32.13.26"' })

  await page.goto('/')
  await captureAndProcess(page)

  await expect(page.getByTestId('receipt-review-date-error')).toBeVisible()
  await expect(page.getByTestId('receipt-review-date-error')).toContainText('32.13.26')
  await expect(page.getByTestId('receipt-review-date')).toHaveText(`Date: ${TODAY_DISPLAY}`)

  await page.getByTestId('receipt-review-confirm').click()
  await expect(page.getByTestId('receipt-review-panel')).toHaveCount(0)

  await saveTripAndOpenHistory(page)
  await expect(page.getByTestId('history-trip')).toContainText(TODAY_DISPLAY)
})

test('picking a date resolves an unreadable-date error, and Confirm applies the picked date', async ({ page }) => {
  await mockExtraction(page, { purchaseDate: null, purchaseDateError: 'Unrecognized receipt date "32.13.26"' })

  await page.goto('/')
  await captureAndProcess(page)
  await expect(page.getByTestId('receipt-review-date-error')).toBeVisible()

  await page.getByTestId('receipt-review-toggle').click()
  await page.getByTestId('receipt-review-date-input').fill('2026-09-14')
  await expect(page.getByTestId('receipt-review-date-error')).toHaveCount(0)
  await expect(page.getByTestId('receipt-review-date')).toHaveText('Date: 14.09.2026')

  await page.getByTestId('receipt-review-confirm').click()
  await saveTripAndOpenHistory(page)
  await expect(page.getByTestId('history-trip')).toContainText('14.09.2026')
})

test('a malformed purchaseDate in the API response fails the extraction instead of being silently dropped', async ({
  page,
}) => {
  // The API always sends ISO or null — anything else means a server/client
  // mismatch, which must fail loudly like any other malformed response.
  await mockExtraction(page, { purchaseDate: '15.09.2026' })

  await page.goto('/')
  await page.getByTestId('receipt-capture-input').setInputFiles({
    name: 'receipt.png',
    mimeType: 'image/png',
    buffer: SAMPLE_IMAGE,
  })
  await page.getByTestId('receipt-process-button').click()
  await expect(page.getByTestId('receipt-status').first()).toHaveText('Failed — will retry')
  await expect(page.getByTestId('receipt-review-panel')).toHaveCount(0)
})
