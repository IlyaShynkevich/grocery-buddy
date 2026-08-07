import { expect, test, type Page } from './fixtures'

// Same 1x1 PNG fixture used across the other receipt specs.
const SAMPLE_IMAGE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

async function itemNames(page: Page): Promise<string[]> {
  return page.getByTestId('shopping-list-item').locator('input[type="text"]').evaluateAll((inputs) =>
    inputs.map((input) => (input as HTMLInputElement).value),
  )
}

test('tapping the add-receipt button presents both Camera and Choose from Photos options', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByTestId('receipt-source-menu')).toHaveCount(0)

  await page.getByTestId('receipt-add-button').click()

  await expect(page.getByTestId('receipt-source-menu')).toBeVisible()
  await expect(page.getByTestId('receipt-camera-option')).toBeVisible()
  await expect(page.getByTestId('receipt-gallery-option')).toBeVisible()
})

test('the source menu closes after picking an option', async ({ page }) => {
  await page.goto('/')

  await page.getByTestId('receipt-add-button').click()
  await expect(page.getByTestId('receipt-source-menu')).toBeVisible()

  // Clicking the option triggers a native file picker, which Playwright
  // can't drive directly — but the menu should collapse immediately, same
  // as any other menu-item click, regardless of what the OS does next.
  await page.getByTestId('receipt-camera-option').click()
  await expect(page.getByTestId('receipt-source-menu')).toHaveCount(0)
})

test('the source menu closes on an outside click without picking anything', async ({ page }) => {
  await page.goto('/')

  await page.getByTestId('receipt-add-button').click()
  await expect(page.getByTestId('receipt-source-menu')).toBeVisible()

  await page.mouse.click(10, 10)
  await expect(page.getByTestId('receipt-source-menu')).toHaveCount(0)
})

test('Camera entry point: capturing and processing a receipt reaches the same successful extraction flow', async ({
  page,
}) => {
  await page.route('**/api/extract-receipt', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [{ name: 'Milk', price: 3.49, category: 'dairy' }] }),
    }),
  )

  await page.goto('/')

  // The hidden camera input (capture="environment") is the same one that
  // existed before this feature — selecting a file on it is exactly what
  // tapping "Camera" in the menu triggers.
  await page.getByTestId('receipt-capture-input').setInputFiles({
    name: 'camera-receipt.png',
    mimeType: 'image/png',
    buffer: SAMPLE_IMAGE,
  })
  await expect(page.getByTestId('receipt-item')).toHaveCount(1)

  await page.getByTestId('receipt-process-button').click()

  await expect(page.getByTestId('receipt-status').first()).toHaveText('Processed')
  await expect.poll(() => itemNames(page)).toEqual(['Milk'])
})

test('Choose from Photos entry point: picking an existing image reaches the same successful extraction flow', async ({
  page,
}) => {
  await page.route('**/api/extract-receipt', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [{ name: 'Bread', price: 2.49, category: 'bakery' }] }),
    }),
  )

  await page.goto('/')

  // The hidden gallery input has no `capture` attribute, so on a real phone
  // it opens the OS photo/file picker instead of the camera. Functionally
  // it feeds into the exact same handleFileChange -> captureReceipt path as
  // the camera input — this exercises that shared downstream pipeline.
  await page.getByTestId('receipt-gallery-input').setInputFiles({
    name: 'gallery-receipt.png',
    mimeType: 'image/png',
    buffer: SAMPLE_IMAGE,
  })
  await expect(page.getByTestId('receipt-item')).toHaveCount(1)

  await page.getByTestId('receipt-process-button').click()

  await expect(page.getByTestId('receipt-status').first()).toHaveText('Processed')
  await expect.poll(() => itemNames(page)).toEqual(['Bread'])
})

test('the gallery input has no capture attribute, and the camera input keeps capture="environment"', async ({
  page,
}) => {
  await page.goto('/')

  await expect(page.getByTestId('receipt-capture-input')).toHaveAttribute('capture', 'environment')
  await expect(page.getByTestId('receipt-gallery-input')).not.toHaveAttribute('capture', /.*/)
})
