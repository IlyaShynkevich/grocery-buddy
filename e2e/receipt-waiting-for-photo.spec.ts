import { expect, test, type Page } from './fixtures'

// Same 1x1 PNG fixture used in the other receipt specs.
const SAMPLE_IMAGE = {
  name: 'receipt.png',
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  ),
}

/**
 * Taps Add receipt photo -> Camera/Photos. Playwright intercepts the native
 * picker as a `filechooser` event, which stands in for the camera app being
 * open: until the test calls setFiles (or cancels), the page is exactly
 * where it is on a phone while the user is still in the camera.
 */
async function openPicker(page: Page, option: 'receipt-camera-option' | 'receipt-gallery-option') {
  const chooserPromise = page.waitForEvent('filechooser')
  await page.getByTestId('receipt-add-button').click()
  await page.getByTestId(option).click()
  return chooserPromise
}

const waiting = (page: Page) => page.getByTestId('receipt-waiting-for-photo')

test('tapping Camera shows "Waiting for photo…" until the photo arrives, then the receipt row replaces it', async ({
  page,
}) => {
  await page.goto('/')
  await expect(waiting(page)).toHaveCount(0)

  const chooser = await openPicker(page, 'receipt-camera-option')
  await expect(waiting(page)).toBeVisible()
  await expect(waiting(page)).toContainText('Waiting for photo')
  await expect(page.getByTestId('receipt-item')).toHaveCount(0)

  await chooser.setFiles(SAMPLE_IMAGE)
  await expect(page.getByTestId('receipt-item')).toHaveCount(1)
  await expect(waiting(page)).toHaveCount(0)
  await expect(page.getByTestId('receipt-capture-error')).toHaveCount(0)
})

test('choosing from Photos shows the same waiting state', async ({ page }) => {
  await page.goto('/')
  const chooser = await openPicker(page, 'receipt-gallery-option')
  await expect(waiting(page)).toBeVisible()

  await chooser.setFiles(SAMPLE_IMAGE)
  await expect(page.getByTestId('receipt-item')).toHaveCount(1)
  await expect(waiting(page)).toHaveCount(0)
})

test('cancelling the camera/picker clears the waiting state without adding a receipt', async ({ page }) => {
  await page.goto('/')
  const chooser = await openPicker(page, 'receipt-camera-option')
  await expect(waiting(page)).toBeVisible()

  // What the browser fires on the input when the picker/camera is dismissed
  // without choosing anything (Playwright can't dismiss a native picker).
  await chooser.element().dispatchEvent('cancel')

  await expect(waiting(page)).toHaveCount(0)
  await expect(page.getByTestId('receipt-item')).toHaveCount(0)
  await expect(page.getByText('No receipts captured yet.')).toBeVisible()
})

test('the waiting state can be dismissed by hand, and a photo that still arrives is saved normally', async ({
  page,
}) => {
  await page.goto('/')
  const chooser = await openPicker(page, 'receipt-camera-option')
  await expect(waiting(page)).toBeVisible()

  await page.getByTestId('receipt-waiting-dismiss').click()
  await expect(waiting(page)).toHaveCount(0)

  await chooser.setFiles(SAMPLE_IMAGE)
  await expect(page.getByTestId('receipt-item')).toHaveCount(1)
  await expect(waiting(page)).toHaveCount(0)
})
