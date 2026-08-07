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

  // The extracted items already exist on the trip regardless of the panel
  // (M5 part 1 behavior) — reviewing just lets you fix something before
  // dismissing.
  await expect.poll(() => itemNames(page)).toEqual(['Milk', 'Bread'])

  // Remove the wrongly-scanned "Bread" line via the review panel.
  await reviewItems.nth(1).getByTestId('receipt-review-item-remove').click()
  await expect(reviewItems).toHaveCount(1)

  await page.getByTestId('receipt-review-confirm').click()
  await expect(page.getByTestId('receipt-review-panel')).toHaveCount(0)

  await expect.poll(() => itemNames(page)).toEqual(['Milk'])
})

test('case B: typed item auto-matches a scanned item, confirming the match merges them', async ({ page }) => {
  await page.route('**/api/extract-receipt', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
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

  // Both entries exist side by side until the match is confirmed.
  await expect.poll(() => itemNames(page)).toEqual(['Milk', 'Milch 1L'])

  await match.getByTestId('receipt-review-match-yes').click()

  // Merging drops the typed duplicate and keeps the receipt-priced item.
  await expect.poll(() => itemNames(page)).toEqual(['Milch 1L'])
  await expect(page.getByTestId('receipt-review-match')).toHaveCount(0)

  await page.getByTestId('receipt-review-confirm').click()
  await expect(page.getByTestId('receipt-review-panel')).toHaveCount(0)
})

test('case B: typed item stays separate when the user rejects the suggested match', async ({ page }) => {
  await page.route('**/api/extract-receipt', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
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
  // Rejecting a match changes nothing — both entries were already there.
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

  await expect.poll(() => itemNames(page)).toEqual(['Bananas', 'Eggs'])

  await page.getByTestId('receipt-review-confirm').click()
  await expect(page.getByTestId('receipt-review-panel')).toHaveCount(0)
  await expect.poll(() => itemNames(page)).toEqual(['Bananas', 'Eggs'])
})

test('ignoring the review panel (dismissing without deciding) does not lose the scanned items', async ({
  page,
}) => {
  await page.route('**/api/extract-receipt', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [{ name: 'Milk', price: 3.49, category: 'dairy' }],
      }),
    }),
  )

  await page.goto('/')
  await captureAndProcess(page)

  await expect(page.getByTestId('receipt-review-panel')).toBeVisible()
  await page.getByTestId('receipt-review-dismiss').click()
  await expect(page.getByTestId('receipt-review-panel')).toHaveCount(0)

  // Dismissing without confirming anything still leaves the item in place.
  await expect.poll(() => itemNames(page)).toEqual(['Milk'])

  await page.reload()
  await expect(page.getByTestId('receipt-review-panel')).toHaveCount(0)
  await expect.poll(() => itemNames(page)).toEqual(['Milk'])
})
