import { expect, test, type Page } from '@playwright/test'

// Same 1x1 PNG fixture used in the other receipt specs.
const SAMPLE_IMAGE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

function mascotPose(page: Page) {
  return page.getByTestId('mascot').getAttribute('data-pose')
}

test('mascot goes idle -> scanning while processing -> happy on success -> idle again', async ({ page }) => {
  await page.goto('/')
  await expect.poll(() => mascotPose(page)).toBe('idle')

  // Delay the mocked extraction response so the "scanning" pose has a
  // window to actually be observed, same as the other receipt specs' use
  // of route mocking to drive the client-side status machine deterministically.
  await page.route('**/api/extract-receipt', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500))
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [{ name: 'Milk', price: 3.49, category: 'dairy' }] }),
    })
  })

  await page.getByTestId('receipt-capture-input').setInputFiles({
    name: 'receipt.png',
    mimeType: 'image/png',
    buffer: SAMPLE_IMAGE,
  })
  await page.getByTestId('receipt-process-button').click()

  await expect(page.getByTestId('receipt-status').first()).toHaveText('Processing…')
  await expect.poll(() => mascotPose(page)).toBe('scanning')

  await expect(page.getByTestId('receipt-status').first()).toHaveText('Processed')
  await expect.poll(() => mascotPose(page)).toBe('happy')

  // The happy pose is a brief pulse (~1.8s in the app), not a new steady
  // state — it must revert to idle on its own, not stay stuck.
  await expect.poll(() => mascotPose(page), { timeout: 5000 }).toBe('idle')
})
