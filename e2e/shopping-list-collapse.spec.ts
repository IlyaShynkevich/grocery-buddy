import { expect, test, type Page } from '@playwright/test'

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
      body: JSON.stringify({ items: [{ name: 'Milk', price: 3.49, category: 'dairy' }] }),
    }),
  )
  await page.getByTestId('receipt-capture-input').setInputFiles({
    name: 'receipt.png',
    mimeType: 'image/png',
    buffer: SAMPLE_IMAGE,
  })
  await page.getByTestId('receipt-process-button').click()
  await expect(page.getByTestId('receipt-status').first()).toHaveText('Processed')
  await expect(page.getByTestId('receipt-review-panel')).toBeVisible()
}

test('the shopping list is open by default, and the toggle collapses/expands it either way, any time', async ({
  page,
}) => {
  await page.goto('/')

  await expect(page.getByTestId('add-item-input')).toBeVisible()
  await expect(page.getByText("No items yet — add what you're picking up.")).toBeVisible()
  await expect(page.getByTestId('shopping-list-toggle')).toBeVisible()
  await expect(page.getByTestId('shopping-list-toggle')).toHaveText('Hide shopping list')

  // No pending review at all here — the toggle still works both ways.
  await page.getByTestId('shopping-list-toggle').click()
  await expect(page.getByTestId('shopping-list-toggle')).toHaveText('Show shopping list')
  await expect(page.getByTestId('add-item-input')).toBeHidden()

  await page.getByTestId('shopping-list-toggle').click()
  await expect(page.getByTestId('shopping-list-toggle')).toHaveText('Hide shopping list')
  await expect(page.getByTestId('add-item-input')).toBeVisible()
})

test('the shopping list auto-collapses once a receipt review becomes pending', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('add-item-input')).toBeVisible()

  await captureAndProcess(page)

  // Save trip stays visible alongside the review panel — the whole point
  // is not needing to scroll past the item list to reach either.
  await expect(page.getByTestId('save-trip-button')).toBeVisible()
  await expect(page.getByTestId('receipt-review-panel')).toBeVisible()

  await expect(page.getByTestId('shopping-list-toggle')).toBeVisible()
  await expect(page.getByTestId('shopping-list-toggle')).toHaveText('Show shopping list')
  await expect(page.getByTestId('add-item-input')).toBeHidden()
  await expect(page.getByTestId('shopping-list-items')).toBeHidden()
})

test('the collapsed shopping list can be manually expanded while a review is still pending', async ({ page }) => {
  await page.goto('/')
  await captureAndProcess(page)

  await expect(page.getByTestId('add-item-input')).toBeHidden()

  await page.getByTestId('shopping-list-toggle').click()

  await expect(page.getByTestId('shopping-list-toggle')).toHaveText('Hide shopping list')
  await expect(page.getByTestId('add-item-input')).toBeVisible()
  await expect(page.getByTestId('shopping-list-items')).toBeVisible()
  // The review panel and Save trip button are unaffected by the manual expand.
  await expect(page.getByTestId('receipt-review-panel')).toBeVisible()
  await expect(page.getByTestId('save-trip-button')).toBeVisible()

  // Toggling back re-collapses it.
  await page.getByTestId('shopping-list-toggle').click()
  await expect(page.getByTestId('shopping-list-toggle')).toHaveText('Show shopping list')
  await expect(page.getByTestId('add-item-input')).toBeHidden()
})

test('confirming the review keeps the shopping list collapsed, not re-expanded', async ({ page }) => {
  await page.goto('/')
  await captureAndProcess(page)
  await expect(page.getByTestId('add-item-input')).toBeHidden()

  await page.getByTestId('receipt-review-confirm').click()
  await expect(page.getByTestId('receipt-review-panel')).toHaveCount(0)

  // Still collapsed — the toggle affordance stays around specifically so
  // the user can expand it themselves, which is the only thing that should.
  await expect(page.getByTestId('shopping-list-toggle')).toHaveText('Show shopping list')
  await expect(page.getByTestId('add-item-input')).toBeHidden()
  await expect(page.getByTestId('shopping-list-items')).toBeHidden()

  await page.getByTestId('shopping-list-toggle').click()
  await expect(page.getByTestId('add-item-input')).toBeVisible()
})

test('dismissing the review (without confirming) also keeps the shopping list collapsed', async ({ page }) => {
  await page.goto('/')
  await captureAndProcess(page)
  await expect(page.getByTestId('add-item-input')).toBeHidden()

  await page.getByTestId('receipt-review-dismiss').click()
  await expect(page.getByTestId('receipt-review-panel')).toHaveCount(0)

  await expect(page.getByTestId('shopping-list-toggle')).toHaveText('Show shopping list')
  await expect(page.getByTestId('add-item-input')).toBeHidden()
})

test('a review resolving does not force-collapse a list the user had manually expanded', async ({ page }) => {
  await page.goto('/')
  await captureAndProcess(page)

  await page.getByTestId('shopping-list-toggle').click()
  await expect(page.getByTestId('add-item-input')).toBeVisible()

  await page.getByTestId('receipt-review-confirm').click()
  await expect(page.getByTestId('receipt-review-panel')).toHaveCount(0)
  await expect(page.getByTestId('add-item-input')).toBeVisible()
})

test('a fresh receipt review after a previous one starts collapsed again, ignoring any earlier manual expand', async ({
  page,
}) => {
  await page.goto('/')
  await captureAndProcess(page)

  // Manually expand, then confirm — stays expanded (the user's own choice
  // is respected across the review resolving).
  await page.getByTestId('shopping-list-toggle').click()
  await expect(page.getByTestId('add-item-input')).toBeVisible()
  await page.getByTestId('receipt-review-confirm').click()
  await expect(page.getByTestId('receipt-review-panel')).toHaveCount(0)
  await expect(page.getByTestId('add-item-input')).toBeVisible()

  // A second receipt starts a fresh pending review — should collapse by
  // default again, not remember the previous manual expand.
  await captureAndProcess(page)
  await expect(page.getByTestId('shopping-list-toggle')).toHaveText('Show shopping list')
  await expect(page.getByTestId('add-item-input')).toBeHidden()
})

test('saving the trip starts the fresh draft uncollapsed, not inheriting the finished trip\'s collapsed state', async ({
  page,
}) => {
  await page.goto('/')
  await captureAndProcess(page)

  // Leave it collapsed (don't manually expand) through to Save trip.
  await page.getByTestId('receipt-review-confirm').click()
  await expect(page.getByTestId('shopping-list-toggle')).toHaveText('Show shopping list')

  await page.getByTestId('save-trip-button').click()
  await expect(page.getByTestId('shopping-list-toggle')).toHaveText('Hide shopping list')
  await expect(page.getByTestId('add-item-input')).toBeVisible()
})
