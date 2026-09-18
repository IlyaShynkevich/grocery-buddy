import { expect, test, type Page } from './fixtures'

// Same 1x1 PNG fixture used in the other receipt specs.
const SAMPLE_IMAGE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

async function captureAndProcess(page: Page) {
  await page.getByTestId('receipt-capture-input').setInputFiles({
    name: 'receipt.png',
    mimeType: 'image/png',
    buffer: SAMPLE_IMAGE,
  })
  await page.getByTestId('receipt-process-button').click()
  await expect(page.getByTestId('receipt-status').first()).toHaveText('Processed')
}

async function addTypedItem(page: Page, name: string) {
  await page.getByTestId('add-item-input').fill(name)
  await page.getByTestId('add-item-submit').click()
}

async function itemNames(page: Page): Promise<string[]> {
  return page.getByTestId('shopping-list-item').locator('input[type="text"]').evaluateAll((inputs) =>
    inputs.map((input) => (input as HTMLInputElement).value),
  )
}

test('case A: no prior typed items — review panel shows a plain confirmation, edits apply on Confirm', async ({
  page,
}) => {
  await page.route('**/api/extract-receipt', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        purchaseDate: null,
        items: [
          { name: 'Milk', price: 3.49, category: 'dairy' },
          { name: 'Bread', price: 2.49, category: 'bakery' },
        ],
      }),
    }),
  )

  await page.goto('/')
  await captureAndProcess(page)

  await expect(page.getByTestId('receipt-review-panel')).toBeVisible()
  await expect(page.getByTestId('receipt-review-title')).toHaveText("Here's what we found")
  await expect(page.getByTestId('receipt-review-match')).toHaveCount(0)

  const reviewItems = page.getByTestId('receipt-review-item')
  await expect(reviewItems).toHaveCount(2)
  await expect(reviewItems.nth(0)).toContainText('Milk')
  await expect(reviewItems.nth(1)).toContainText('Bread')

  // Extracted items are staged on the review panel only — nothing has
  // touched the shopping list yet, unlike the old "items land immediately"
  // behavior.
  await expect.poll(() => itemNames(page)).toEqual([])

  // Remove the wrongly-scanned "Bread" line via the review panel — the item
  // list is collapsed by default, so it has to be expanded first.
  await page.getByTestId('receipt-review-toggle').click()
  await reviewItems.nth(1).getByTestId('receipt-review-item-remove').click()
  await expect(reviewItems).toHaveCount(1)

  await page.getByTestId('receipt-review-confirm').click()
  await expect(page.getByTestId('receipt-review-panel')).toHaveCount(0)

  // Only the surviving, confirmed item actually lands on the trip.
  await expect.poll(() => itemNames(page)).toEqual(['Milk'])
})

test('case B: typed item auto-matches a scanned item, confirming the match merges them', async ({ page }) => {
  await page.route('**/api/extract-receipt', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        purchaseDate: null,
        items: [{ name: 'Milch 1L', price: 1.29, category: 'dairy' }],
      }),
    }),
  )

  await page.goto('/')
  await addTypedItem(page, 'Milk')
  await expect.poll(() => itemNames(page)).toEqual(['Milk'])

  await captureAndProcess(page)

  await expect(page.getByTestId('receipt-review-panel')).toBeVisible()
  await expect(page.getByTestId('receipt-review-title')).toHaveText('Review your scan')

  const match = page.getByTestId('receipt-review-match')
  await expect(match).toHaveCount(1)
  await expect(match).toContainText('Milk')
  await expect(match).toContainText('Milch 1L')

  // The scanned item is staged on the review panel only — the shopping list
  // still shows just the typed one until Confirm.
  await expect.poll(() => itemNames(page)).toEqual(['Milk'])

  await match.getByTestId('receipt-review-match-yes').click()

  // Answering "yes" records the decision but doesn't act on it yet — still
  // just the typed item until Confirm.
  await expect.poll(() => itemNames(page)).toEqual(['Milk'])
  await expect(page.getByTestId('receipt-review-match')).toHaveCount(0)

  await page.getByTestId('receipt-review-confirm').click()
  await expect(page.getByTestId('receipt-review-panel')).toHaveCount(0)

  // Confirm is what actually drops the typed duplicate and keeps the
  // receipt-priced item.
  await expect.poll(() => itemNames(page)).toEqual(['Milch 1L'])
})

test('case B: typed item stays separate when the user rejects the suggested match', async ({ page }) => {
  await page.route('**/api/extract-receipt', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        purchaseDate: null,
        items: [{ name: 'Milch 1L', price: 1.29, category: 'dairy' }],
      }),
    }),
  )

  await page.goto('/')
  await addTypedItem(page, 'Milk')
  await captureAndProcess(page)

  const match = page.getByTestId('receipt-review-match')
  await expect(match).toHaveCount(1)
  await match.getByTestId('receipt-review-match-no').click()

  await expect(page.getByTestId('receipt-review-match')).toHaveCount(0)
  // Rejecting a match records "keep both" but still nothing is on the
  // shopping list until Confirm — the scanned item is still just staged.
  await expect.poll(() => itemNames(page)).toEqual(['Milk'])

  await page.getByTestId('receipt-review-confirm').click()
  // Confirm inserts the scanned item alongside the typed one, unmerged.
  await expect.poll(() => itemNames(page)).toEqual(['Milk', 'Milch 1L'])
})

test('case B with no matches found: unrelated typed and scanned items are just added separately', async ({
  page,
}) => {
  await page.route('**/api/extract-receipt', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        purchaseDate: null,
        items: [{ name: 'Eggs', price: 2.99, category: 'dairy' }],
      }),
    }),
  )

  await page.goto('/')
  await addTypedItem(page, 'Bananas')
  await captureAndProcess(page)

  await expect(page.getByTestId('receipt-review-panel')).toBeVisible()
  // No plausible match between "Bananas" and "Eggs" — plain confirmation,
  // same as case A, even though typed items existed before the scan.
  await expect(page.getByTestId('receipt-review-title')).toHaveText("Here's what we found")
  await expect(page.getByTestId('receipt-review-match')).toHaveCount(0)

  // Only the typed item is on the shopping list — the scanned "Eggs" is
  // still staged, waiting on Confirm.
  await expect.poll(() => itemNames(page)).toEqual(['Bananas'])

  await page.getByTestId('receipt-review-confirm').click()
  await expect(page.getByTestId('receipt-review-panel')).toHaveCount(0)
  await expect.poll(() => itemNames(page)).toEqual(['Bananas', 'Eggs'])
})

test('dismissing the review panel discards the scanned items — as if the scan never happened', async ({
  page,
}) => {
  await page.route('**/api/extract-receipt', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        purchaseDate: null,
        items: [{ name: 'Milk', price: 3.49, category: 'dairy' }],
      }),
    }),
  )

  await page.goto('/')
  await captureAndProcess(page)

  await expect(page.getByTestId('receipt-review-panel')).toBeVisible()
  // Staged, never inserted — true both before and after dismissing.
  await expect.poll(() => itemNames(page)).toEqual([])

  await page.getByTestId('receipt-review-dismiss').click()
  await expect(page.getByTestId('receipt-review-panel')).toHaveCount(0)
  await expect.poll(() => itemNames(page)).toEqual([])

  // Survives reload too — the discard was a real Dexie write (reviewed:
  // true, stagedItems cleared), not just in-memory state that happened to
  // still be empty.
  await page.reload()
  await expect(page.getByTestId('receipt-review-panel')).toHaveCount(0)
  await expect.poll(() => itemNames(page)).toEqual([])
})

test('deleting the receipt photo before ever confirming leaves the shopping list untouched', async ({ page }) => {
  await page.route('**/api/extract-receipt', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        purchaseDate: null,
        items: [{ name: 'Milk', price: 3.49, category: 'dairy' }],
      }),
    }),
  )

  await page.goto('/')
  await captureAndProcess(page)

  await expect(page.getByTestId('receipt-review-panel')).toBeVisible()
  await expect.poll(() => itemNames(page)).toEqual([])

  // Deleting the receipt (not just dismissing the review) — the staged
  // items live on that same row, so nothing extra has to happen for them
  // to disappear along with it.
  await page.getByTestId('receipt-item').getByRole('button', { name: 'Remove receipt' }).click()
  await expect(page.getByTestId('receipt-item')).toHaveCount(0)
  await expect(page.getByTestId('receipt-review-panel')).toHaveCount(0)
  await expect.poll(() => itemNames(page)).toEqual([])

  await page.reload()
  await expect.poll(() => itemNames(page)).toEqual([])
})
