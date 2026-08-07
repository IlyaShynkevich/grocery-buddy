import { expect, test, type Page } from '@playwright/test'

// Same 1x1 PNG fixture used in the other receipt specs.
const SAMPLE_IMAGE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

function categoryAccordion(page: Page, key: string) {
  return page.locator(`[data-testid="category-accordion"][data-category-key="${key}"]`)
}

async function addCategoryNote(page: Page, categoryKey: string, text: string) {
  await page.getByTestId('nav-customize').click()
  const accordion = categoryAccordion(page, categoryKey)
  await accordion.locator('summary').click()
  await accordion.getByTestId('category-note-input').fill(text)
  await accordion.getByTestId('category-note-submit').click()
  await expect(accordion.getByTestId('category-note')).toHaveCount(1)
  await page.getByTestId('nav-shopping').click()
}

async function captureReceipt(page: Page) {
  await page.getByTestId('receipt-capture-input').setInputFiles({
    name: 'receipt.png',
    mimeType: 'image/png',
    buffer: SAMPLE_IMAGE,
  })
  await expect(page.getByTestId('receipt-item')).toHaveCount(1)
}

/** Saves the active trip and waits for a fresh draft to replace it. */
async function saveTrip(page: Page) {
  const tripId = await page.getByTestId('shopping-list').getAttribute('data-trip-id')
  await page.getByTestId('save-trip-button').click()
  await expect.poll(() => page.getByTestId('shopping-list').getAttribute('data-trip-id')).not.toBe(tripId)
}

test('a category note is sent with the extraction request, and its essentialOverride flips the item off its category default', async ({
  page,
}) => {
  let requestBody: Record<string, unknown> | undefined
  await page.route('**/api/extract-receipt', (route) => {
    requestBody = route.request().postDataJSON()
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        // Frozen is essential by default (see src/db/categories.ts) — this
        // response simulates the model flagging Nuggets as the exception
        // the "nuggets" note under Frozen describes.
        items: [{ name: 'Nuggets', price: 3.5, category: 'frozen', essentialOverride: false }],
      }),
    })
  })

  await page.goto('/')
  await addCategoryNote(page, 'frozen', 'nuggets')

  await captureReceipt(page)
  await page.getByTestId('receipt-process-button').click()
  await expect(page.getByTestId('receipt-status').first()).toHaveText('Processed')

  expect(requestBody).toMatchObject({ notes: [{ category: 'frozen', notes: ['nuggets'] }] })

  await saveTrip(page)
  await page.getByTestId('nav-history').click()
  await page.getByTestId('history-trip').click()
  await expect(page.getByTestId('trip-detail-page')).toBeVisible()

  const nuggetsRow = page.locator('[data-testid="trip-detail-item"]', { hasText: 'Nuggets' })
  await expect(nuggetsRow.getByTestId('trip-detail-item-essential')).toHaveText('non-essential')
  await expect(nuggetsRow.getByTestId('trip-detail-item-essential')).toHaveAttribute('data-essential', 'false')
})

test('with no category notes set, the extraction request omits notes entirely — no bloat for the common case', async ({
  page,
}) => {
  let requestBody: Record<string, unknown> | undefined
  await page.route('**/api/extract-receipt', (route) => {
    requestBody = route.request().postDataJSON()
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [{ name: 'Milk', price: 3.49, category: 'dairy' }] }),
    })
  })

  await page.goto('/')
  await captureReceipt(page)
  await page.getByTestId('receipt-process-button').click()
  await expect(page.getByTestId('receipt-status').first()).toHaveText('Processed')

  expect(requestBody).toBeDefined()
  expect(requestBody?.notes).toBeUndefined()
})
