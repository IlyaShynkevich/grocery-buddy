import { expect, test } from './fixtures'

// Same 1x1 PNG fixture used in the other receipt specs.
const SAMPLE_IMAGE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

test('a missing-API-key response shows a friendly demo-mode message, not a generic error', async ({ page }) => {
  // Mirrors api/extract-receipt.ts's own response shape when
  // OPENAI_API_KEY isn't configured on the deployment — a 200 with
  // items: [] and demo: true, not the 500 this used to be.
  await page.route('**/api/extract-receipt', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [], demo: true }),
    }),
  )

  await page.goto('/')
  await page.getByTestId('receipt-capture-input').setInputFiles({
    name: 'receipt.png',
    mimeType: 'image/png',
    buffer: SAMPLE_IMAGE,
  })
  await expect(page.getByTestId('receipt-item')).toHaveCount(1)

  await page.getByTestId('receipt-process-button').click()

  // Not the generic "Failed — will retry" / "Something went wrong" copy.
  await expect(page.getByTestId('receipt-status').first()).toHaveText('Demo mode')
  const errorText = page.getByTestId('receipt-error')
  await expect(errorText).toContainText('disabled in this public demo')
  await expect(errorText).toContainText('README')

  // Styled like a muted/empty state (same color as the receipt's own
  // timestamp line), not the alarming red used for a real extraction
  // failure.
  const mutedColor = await page.getByTestId('receipt-timestamp').evaluate((el) => getComputedStyle(el).color)
  await expect(errorText).toHaveCSS('color', mutedColor)

  // No auto-retry countdown gets scheduled for this case — retrying can
  // only ever reach the same demo response again.
  await page.waitForTimeout(1000)
  await expect(page.getByTestId('receipt-status').first()).toHaveText('Demo mode')

  // Nothing was actually extracted, and no items should have been added.
  await expect(page.getByTestId('shopping-list-item')).toHaveCount(0)
})

test('the typed shopping list still works completely normally when receipt scanning is in demo mode', async ({
  page,
}) => {
  await page.route('**/api/extract-receipt', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], demo: true }) }),
  )

  await page.goto('/')
  await page.getByTestId('add-item-input').fill('Milk')
  await page.getByTestId('add-item-submit').click()
  await expect(page.getByTestId('shopping-list-item').last().locator('input[type="text"]')).toHaveValue('Milk')
})
