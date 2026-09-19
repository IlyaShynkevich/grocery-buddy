import { expect, test, type Page } from './fixtures'
// Drives the Debug tools panel, which is hidden unless enabled for the session.
test.use({ debugTools: true })

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
  await page.getByTestId('receipt-capture-input').setInputFiles({
    name: 'receipt.png',
    mimeType: 'image/png',
    buffer: SAMPLE_IMAGE,
  })
  await page.getByTestId('receipt-process-button').click()
  await expect(page.getByTestId('receipt-status').first()).toHaveText('Processed')
}

test('the review panel opens collapsed by default, with a total and Confirm but no visible item list', async ({
  page,
}) => {
  await captureAndProcess(page)

  await expect(page.getByTestId('receipt-review-panel')).toBeVisible()
  await expect(page.getByTestId('receipt-review-toggle')).toHaveText('Show items ▸')
  await expect(page.getByTestId('receipt-review-total')).toContainText('5,98')
  await expect(page.getByTestId('receipt-review-confirm')).toBeVisible()
  await expect(page.getByTestId('receipt-review-items')).toBeHidden()
})

test('expanding the toggle reveals the full item list, and collapsing hides it again', async ({ page }) => {
  await captureAndProcess(page)

  await page.getByTestId('receipt-review-toggle').click()
  await expect(page.getByTestId('receipt-review-toggle')).toHaveText('Hide items ▾')
  await expect(page.getByTestId('receipt-review-items')).toBeVisible()

  const items = page.getByTestId('receipt-review-item')
  await expect(items).toHaveCount(2)
  await expect(items.nth(0)).toContainText('Milk')
  await expect(items.nth(0)).toContainText('Dairy')
  await expect(items.nth(0)).toContainText('essential')
  await expect(items.nth(1)).toContainText('Bread')

  await page.getByTestId('receipt-review-toggle').click()
  await expect(page.getByTestId('receipt-review-toggle')).toHaveText('Show items ▸')
  await expect(page.getByTestId('receipt-review-items')).toBeHidden()
})

test('editing an item price live-updates the total, and the edit survives collapsing the panel', async ({
  page,
}) => {
  await captureAndProcess(page)
  await page.getByTestId('receipt-review-toggle').click()

  const milkPrice = page.getByTestId('receipt-review-item').nth(0).getByTestId('receipt-review-item-price')
  await milkPrice.fill('5.00')

  // 5.00 (edited Milk) + 2.49 (Bread) = 7.49 — not the AI's original 5.98.
  await expect(page.getByTestId('receipt-review-total')).toContainText('7,49')

  // Collapse without losing the edit.
  await page.getByTestId('receipt-review-toggle').click()
  await expect(page.getByTestId('receipt-review-items')).toBeHidden()
  await expect(page.getByTestId('receipt-review-total')).toContainText('7,49')

  // Expand again — the edited value is still there, not reverted to 3.49.
  await page.getByTestId('receipt-review-toggle').click()
  await expect(milkPrice).toHaveValue('5.00')
})

test('Confirm at the bottom of the expanded view saves edits and closes the panel', async ({ page }) => {
  await captureAndProcess(page)
  await page.getByTestId('debug-panel-toggle').click()
  await page.getByTestId('receipt-review-toggle').click()

  const milkPrice = page.getByTestId('receipt-review-item').nth(0).getByTestId('receipt-review-item-price')
  await milkPrice.fill('5.00')
  await expect(page.getByTestId('receipt-review-total')).toContainText('7,49')

  // Only one Confirm is on screen at a time — with the panel expanded it now
  // sits below the item list, not pinned above it.
  const confirm = page.getByTestId('receipt-review-confirm')
  await expect(confirm).toBeVisible()
  const confirmBox = await confirm.boundingBox()
  const itemsBox = await page.getByTestId('receipt-review-items').boundingBox()
  expect(confirmBox && itemsBox && confirmBox.y).toBeGreaterThan(itemsBox!.y)

  await confirm.click()
  await expect(page.getByTestId('receipt-review-panel')).toHaveCount(0)

  // The edited price (not the AI's original 3.49) is what actually landed
  // in Dexie.
  const activeTripDiv = page.locator('[data-testid="debug-trip"][data-active="true"]')
  const milkRow = activeTripDiv.getByTestId('debug-item').filter({ hasText: 'Milk' })
  await expect(milkRow).toContainText('5,00')
})

test('an edit survives a reload while the review is still pending — it was written to Dexie, not just held in memory', async ({
  page,
}) => {
  await captureAndProcess(page)
  await page.getByTestId('receipt-review-toggle').click()

  const milkPrice = page.getByTestId('receipt-review-item').nth(0).getByTestId('receipt-review-item-price')
  await milkPrice.fill('5.00')
  await expect(page.getByTestId('receipt-review-total')).toContainText('7,49')

  await page.reload()

  // Still staged (never inserted into the shopping list)...
  await expect(page.getByTestId('shopping-list-item')).toHaveCount(0)
  // ...but the edit itself wasn't lost.
  await expect(page.getByTestId('receipt-review-total')).toContainText('7,49')
})
