import { expect, test, type Page } from './fixtures'

// Same 1x1 PNG fixture used in the other receipt specs.
const SAMPLE_IMAGE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

async function mockExtraction(page: Page) {
  await page.route('**/api/extract-receipt', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ purchaseDate: null, items: [{ name: 'Milk', price: 1.19, category: 'dairy' }] }),
    }),
  )
}

async function captureReceipt(page: Page) {
  const before = await page.getByTestId('receipt-item').count()
  await page.getByTestId('receipt-capture-input').setInputFiles({ name: 'receipt.png', mimeType: 'image/png', buffer: SAMPLE_IMAGE })
  await expect(page.getByTestId('receipt-item')).toHaveCount(before + 1)
}

/** Every receipt row in IndexedDB, with whether it still holds a photo. */
function storedReceipts(page: Page): Promise<{ tripId: number; status: string; hasPhoto: boolean }[]> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('grocery-buddy')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const rows = await new Promise<{ tripId: number; status: string; imageBlob?: Blob }[]>((resolve, reject) => {
      const request = db.transaction('pendingReceipts').objectStore('pendingReceipts').getAll()
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    db.close()
    return rows.map((row) => ({ tripId: row.tripId, status: row.status, hasPhoto: row.imageBlob instanceof Blob }))
  })
}

test('saving a trip deletes its receipts and their photos, and keeps its items', async ({ page }) => {
  await mockExtraction(page)
  await page.goto('/')
  await expect(page.getByTestId('shopping-list')).not.toHaveAttribute('data-trip-id', '')
  const tripId = Number(await page.getByTestId('shopping-list').getAttribute('data-trip-id'))

  // One confirmed, one dismissed — both finished.
  await captureReceipt(page)
  await page.getByTestId('receipt-process-button').click()
  await page.getByTestId('receipt-review-confirm').click()
  await captureReceipt(page)
  await page.getByTestId('receipt-process-button').click()
  await page.getByTestId('receipt-review-dismiss').click()

  expect(await storedReceipts(page)).toEqual([
    { tripId, status: 'done', hasPhoto: true },
    { tripId, status: 'done', hasPhoto: true },
  ])

  await page.getByTestId('save-trip-button').click()
  await expect(page.getByTestId('shopping-list')).not.toHaveAttribute('data-trip-id', String(tripId))

  expect(await storedReceipts(page)).toEqual([])
  await expect(page.getByTestId('receipt-item')).toHaveCount(0)

  await page.getByTestId('nav-history').click()
  await expect(page.getByTestId('history-trip')).toHaveCount(1)
  await expect(page.getByTestId('history-trip')).toContainText('1 item')
})

test("saving one trip leaves the next trip's receipts alone", async ({ page }) => {
  await mockExtraction(page)
  await page.goto('/')
  await expect(page.getByTestId('shopping-list')).not.toHaveAttribute('data-trip-id', '')
  const firstTripId = await page.getByTestId('shopping-list').getAttribute('data-trip-id')
  await captureReceipt(page)
  await page.getByTestId('receipt-process-button').click()
  await page.getByTestId('receipt-review-confirm').click()
  await page.getByTestId('save-trip-button').click()
  await expect.poll(() => storedReceipts(page)).toEqual([])
  // The list switches to the fresh draft asynchronously — read its id only
  // once it has actually changed.
  await expect(page.getByTestId('shopping-list')).not.toHaveAttribute('data-trip-id', firstTripId ?? '')

  const nextTripId = Number(await page.getByTestId('shopping-list').getAttribute('data-trip-id'))
  await captureReceipt(page)
  expect(await storedReceipts(page)).toEqual([{ tripId: nextTripId, status: 'pending', hasPhoto: true }])
})

test('if the UI gate is bypassed, the save is refused with a visible error and the unprocessed receipt survives', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.getByTestId('shopping-list')).not.toHaveAttribute('data-trip-id', '')
  const tripId = await page.getByTestId('shopping-list').getAttribute('data-trip-id')

  // Write a pending receipt with raw IndexedDB, which Dexie's live queries
  // don't observe — so Save trip stays enabled, the way it would for a
  // receipt added from another tab. The rule must still hold where the
  // delete actually happens (completeTrip), not only on the button.
  await page.evaluate(async (tripId) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('grocery-buddy')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('pendingReceipts', 'readwrite')
      tx.objectStore('pendingReceipts').add({ tripId, imageBlob: new Blob(['x'], { type: 'image/jpeg' }), capturedAt: Date.now(), status: 'pending' })
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  }, Number(tripId))
  await expect(page.getByTestId('save-trip-button')).toBeEnabled()
  await page.getByTestId('save-trip-button').click()

  const error = page.getByTestId('save-trip-error')
  await expect(error).toBeVisible()
  await expect(error).toContainText('1 receipt(s) still need processing or review')
  await expect(error).toContainText('(pending)')
  expect(await page.getByTestId('shopping-list').getAttribute('data-trip-id')).toBe(tripId)
  expect(await storedReceipts(page)).toEqual([{ tripId: Number(tripId), status: 'pending', hasPhoto: true }])
})
