import { expect, test, type Page } from './fixtures'

// Same 1x1 PNG fixture used in the other receipt specs.
const SAMPLE_IMAGE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

function mascotPose(page: Page) {
  return page.getByTestId('mascot').getAttribute('data-pose')
}

// Delay the mocked extraction response so the "scanning" pose has a window
// to actually be observed, same as the other receipt specs' use of route
// mocking to drive the client-side status machine deterministically.
async function mockSlowExtraction(page: Page, delayMs = 500) {
  await page.route('**/api/extract-receipt', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, delayMs))
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [{ name: 'Milk', price: 3.49, category: 'dairy' }] }),
    })
  })
}

async function captureAndProcess(page: Page) {
  await page.getByTestId('receipt-capture-input').setInputFiles({
    name: 'receipt.png',
    mimeType: 'image/png',
    buffer: SAMPLE_IMAGE,
  })
  await page.getByTestId('receipt-process-button').click()
}

test('mascot goes idle -> scanning while processing -> happy on success, and stays happy (not a brief pulse) until Save trip', async ({
  page,
}) => {
  await page.goto('/')
  await expect.poll(() => mascotPose(page)).toBe('idle')

  await mockSlowExtraction(page)
  await captureAndProcess(page)

  await expect(page.getByTestId('receipt-status').first()).toHaveText('Processing…')
  await expect.poll(() => mascotPose(page)).toBe('scanning')

  await expect(page.getByTestId('receipt-status').first()).toHaveText('Processed')
  await expect.poll(() => mascotPose(page)).toBe('happy')

  // Dismissing the review panel (without saving the trip) must not clear
  // it either — only Save trip does.
  await page.getByTestId('receipt-review-dismiss').click()
  await expect(page.getByTestId('receipt-review-panel')).toHaveCount(0)
  expect(await mascotPose(page)).toBe('happy')

  // A brief pulse used to revert on its own after ~1.8s — it must not
  // anymore. Wait well past that old duration and confirm it's still happy.
  await page.waitForTimeout(2500)
  expect(await mascotPose(page)).toBe('happy')

  // Saving the trip starts a fresh draft — that's what returns it to idle.
  await page.getByTestId('save-trip-button').click()
  await expect.poll(() => mascotPose(page)).toBe('idle')
})

test('capturing a second receipt while happy goes back through scanning, then returns to happy', async ({ page }) => {
  await page.goto('/')

  await mockSlowExtraction(page)
  await captureAndProcess(page)
  await expect(page.getByTestId('receipt-status').first()).toHaveText('Processed')
  await expect.poll(() => mascotPose(page)).toBe('happy')

  await mockSlowExtraction(page)
  await captureAndProcess(page)
  await expect(page.getByTestId('receipt-status').first()).toHaveText('Processing…')
  await expect.poll(() => mascotPose(page)).toBe('scanning')

  await expect(page.getByTestId('receipt-status').first()).toHaveText('Processed')
  await expect.poll(() => mascotPose(page)).toBe('happy')
})
