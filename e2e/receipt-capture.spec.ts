import { expect, test } from '@playwright/test'

// Smallest possible valid PNG (1x1 red pixel) — a stand-in for a receipt
// photo. Playwright's setInputFiles hands the <input type=file> a File
// object the exact same way a camera-captured photo would; the app can't
// tell the difference, so this exercises the real capture -> save path.
const SAMPLE_IMAGE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

async function captureReceipt(page: import('@playwright/test').Page, name: string) {
  await page.getByTestId('receipt-capture-input').setInputFiles({
    name,
    mimeType: 'image/png',
    buffer: SAMPLE_IMAGE,
  })
}

test('captures a receipt photo, marks it pending, and it survives reload', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByTestId('receipt-item')).toHaveCount(0)

  await captureReceipt(page, 'receipt-1.png')

  await expect(page.getByTestId('receipt-item')).toHaveCount(1)
  await expect(page.getByTestId('receipt-status').first()).toHaveText('Waiting to process')
  await expect(page.getByTestId('receipt-item').locator('img')).toHaveCount(1)

  await page.reload()

  await expect(page.getByTestId('receipt-item')).toHaveCount(1)
  await expect(page.getByTestId('receipt-status').first()).toHaveText('Waiting to process')
})

test('captures multiple receipts onto the same trip', async ({ page }) => {
  await page.goto('/')

  await captureReceipt(page, 'receipt-1.png')
  await captureReceipt(page, 'receipt-2.png')

  await expect(page.getByTestId('receipt-item')).toHaveCount(2)
  const statuses = await page.getByTestId('receipt-status').allTextContents()
  expect(statuses).toEqual(['Waiting to process', 'Waiting to process'])
})

test('a receipt can be removed from the pending list', async ({ page }) => {
  await page.goto('/')

  await captureReceipt(page, 'receipt-1.png')
  await expect(page.getByTestId('receipt-item')).toHaveCount(1)

  await page.getByRole('button', { name: 'Remove receipt' }).click()
  await expect(page.getByTestId('receipt-item')).toHaveCount(0)
})

test('captures a receipt while offline, and it is still there after reconnecting and reloading', async ({
  page,
  context,
}) => {
  await page.goto('/')

  // Let the service worker finish precaching the production build before
  // cutting the network — offline support in this app comes from the SW
  // (see CLAUDE.md: PWA/offline features only build in production), not
  // from the capture code itself, so this mirrors real "went offline after
  // the app was already open" usage rather than a cold offline load.
  await page.evaluate(() => navigator.serviceWorker.ready)

  await context.setOffline(true)

  await captureReceipt(page, 'offline-receipt.png')
  await expect(page.getByTestId('receipt-item')).toHaveCount(1)
  await expect(page.getByTestId('receipt-status').first()).toHaveText('Waiting to process')

  await context.setOffline(false)
  await page.reload()

  await expect(page.getByTestId('receipt-item')).toHaveCount(1)
  await expect(page.getByTestId('receipt-status').first()).toHaveText('Waiting to process')
})
