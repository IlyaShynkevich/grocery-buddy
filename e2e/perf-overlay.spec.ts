import { expect, test } from './fixtures'

// TEMPORARY — covers the ?perf=1 timing overlay (src/features/perf/). Delete
// together with it.

const SAMPLE_IMAGE = {
  name: 'receipt.png',
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  ),
}

test('without ?perf=1 there is no overlay', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('shopping-list')).toBeVisible()
  await expect(page.getByTestId('perf-overlay')).toHaveCount(0)
})

test('?perf=1 logs each step of the capture-to-request flow, in order', async ({ page }) => {
  await page.route('**/api/extract-receipt', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ purchaseDate: null, items: [{ name: 'Milk', price: 1.19, category: 'dairy' }] }),
    }),
  )

  await page.goto('/?perf=1')
  const log = page.getByTestId('perf-overlay-log')
  await expect(log).toContainText('page load (navigation start)')

  const chooserPromise = page.waitForEvent('filechooser')
  await page.getByTestId('receipt-add-button').click()
  await page.getByTestId('receipt-camera-option').click()
  const chooser = await chooserPromise
  await chooser.setFiles(SAMPLE_IMAGE)
  await expect(log).toContainText('thumbnail loaded')

  await page.getByTestId('receipt-process-button').click()
  await expect(page.getByTestId('receipt-review-panel')).toBeVisible()
  await expect(log).toContainText('response received (200)')

  const text = (await log.textContent()) ?? ''
  const order = [
    'Camera tap',
    'photo received',
    'photo saved',
    'row shown',
    'thumbnail loaded',
    'Process tap',
    'request sent',
    'response received',
  ]
  const positions = order.map((label) => text.indexOf(label))
  expect(positions.every((p) => p >= 0), `all steps logged:\n${text}`).toBe(true)
  expect([...positions].sort((a, b) => a - b), `steps in order:\n${text}`).toEqual(positions)
})

test('the log survives a reload, which shows up as a second page load entry', async ({ page }) => {
  await page.goto('/?perf=1')
  const log = page.getByTestId('perf-overlay-log')
  await expect(log).toContainText('page load (navigation start)')

  await page.reload()
  await expect.poll(async () => ((await log.textContent()) ?? '').split('page load (navigation start)').length - 1).toBe(2)

  await page.getByTestId('perf-overlay-clear').click()
  await expect(log).toHaveText('')
})
