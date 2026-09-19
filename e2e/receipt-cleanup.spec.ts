import { expect, test, type Page } from './fixtures'

const MARKER = 'cleanup:savedTripReceipts:v1'

interface SeedReceipt {
  id: number
  tripId: number
  status: 'pending' | 'processing' | 'failed' | 'done'
  reviewed?: boolean
  photoBytes: number
}

/**
 * Recreates what an existing device looks like before the cleanup ever ran:
 * saved trips still holding their receipts. Written with raw IndexedDB after
 * the app has created its schema, then the "already ran" marker is removed
 * so the next load behaves like the first load after this update.
 */
async function seedOldDevice(page: Page, receipts: SeedReceipt[], { removeMarker = true } = {}) {
  await page.evaluate(
    async ({ receipts, removeMarker, marker }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('grocery-buddy')
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['trips', 'pendingReceipts', 'appState'], 'readwrite')
        for (const tripId of [101, 102]) {
          tx.objectStore('trips').put({ id: tripId, date: '2026-08-01', total: 5, status: 'complete', createdAt: tripId, completedAt: tripId })
        }
        for (const r of receipts) {
          tx.objectStore('pendingReceipts').put({
            id: r.id,
            tripId: r.tripId,
            imageBlob: new Blob([new Uint8Array(r.photoBytes)], { type: 'image/jpeg' }),
            capturedAt: r.id,
            status: r.status,
            ...(r.reviewed === undefined ? {} : { reviewed: r.reviewed }),
          })
        }
        if (removeMarker) tx.objectStore('appState').delete(marker)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
      db.close()
    },
    { receipts, removeMarker, marker: MARKER },
  )
}

function readDb(page: Page): Promise<{ receiptIds: number[]; marker: unknown }> {
  return page.evaluate(async (marker) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('grocery-buddy')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const tx = db.transaction(['pendingReceipts', 'appState'])
    const get = <T,>(request: IDBRequest<T>) =>
      new Promise<T>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
    const [keys, markerRow] = await Promise.all([
      get(tx.objectStore('pendingReceipts').getAllKeys()),
      get(tx.objectStore('appState').get(marker)),
    ])
    db.close()
    return { receiptIds: (keys as number[]).sort((a, b) => a - b), marker: markerRow ? JSON.parse(markerRow.value) : null }
  }, MARKER)
}

async function activeTripId(page: Page) {
  await expect(page.getByTestId('shopping-list')).not.toHaveAttribute('data-trip-id', '')
  return Number(await page.getByTestId('shopping-list').getAttribute('data-trip-id'))
}

test('on a fresh install the cleanup runs once with nothing to do, and shows no notice', async ({ page }) => {
  await page.goto('/')
  await expect.poll(async () => (await readDb(page)).marker).toMatchObject({ removed: 0, keptUnfinished: 0, freedBytes: 0 })
  await expect(page.getByTestId('receipt-cleanup-notice')).toHaveCount(0)
  await expect(page.getByTestId('receipt-cleanup-error')).toHaveCount(0)
})

test('the cleanup removes finished receipts on saved trips, leaves every unfinished one alone, and says so', async ({
  page,
}) => {
  await page.goto('/')
  const draftId = await activeTripId(page)
  await seedOldDevice(page, [
    // saved trip, finished: removed
    { id: 1, tripId: 101, status: 'done', reviewed: true, photoBytes: 1_500_000 },
    { id: 2, tripId: 101, status: 'done', photoBytes: 500_000 }, // pre-review-step receipt (no `reviewed`)
    // saved trip, NOT finished: must survive
    { id: 3, tripId: 102, status: 'pending', photoBytes: 1000 },
    { id: 4, tripId: 102, status: 'processing', photoBytes: 1000 },
    { id: 5, tripId: 102, status: 'failed', photoBytes: 1000 },
    { id: 6, tripId: 102, status: 'done', reviewed: false, photoBytes: 1000 }, // review still open
    // the draft (active) trip: not saved, must survive even though finished
    { id: 7, tripId: draftId, status: 'done', reviewed: true, photoBytes: 1000 },
  ])

  await page.reload()

  const notice = page.getByTestId('receipt-cleanup-notice')
  await expect(notice).toBeVisible()
  await expect(notice).toContainText('Freed 2.0 MB: removed 2 receipt photos from saved trips')
  await expect(notice).toContainText('Left 4 receipts on saved trips untouched')

  const { receiptIds, marker } = await readDb(page)
  expect(receiptIds).toEqual([3, 4, 5, 6, 7])
  expect(marker).toMatchObject({ removed: 2, freedBytes: 2_000_000, keptUnfinished: 4 })

  await page.getByTestId('receipt-cleanup-dismiss').click()
  await expect(notice).toHaveCount(0)
})

test('the cleanup runs only once: receipts added to saved trips afterwards are not touched on later loads', async ({
  page,
}) => {
  await page.goto('/')
  await seedOldDevice(page, [{ id: 1, tripId: 101, status: 'done', reviewed: true, photoBytes: 1000 }])
  await page.reload()
  await expect(page.getByTestId('receipt-cleanup-notice')).toContainText('removed 1 receipt photo')
  const firstRun = (await readDb(page)).marker

  // Marker left in place this time — as on any later app load.
  await seedOldDevice(page, [{ id: 2, tripId: 101, status: 'done', reviewed: true, photoBytes: 1000 }], { removeMarker: false })
  await page.reload()
  await expect(page.getByTestId('shopping-list')).toBeVisible()
  await page.waitForTimeout(500)

  await expect(page.getByTestId('receipt-cleanup-notice')).toHaveCount(0)
  const { receiptIds, marker } = await readDb(page)
  expect(receiptIds).toEqual([2])
  expect(marker).toEqual(firstRun)
})

test('a cleanup failure part-way through is shown, deletes nothing, and the cleanup retries on the next load', async ({
  page,
}) => {
  // Fail the SECOND receipt delete — after one has already gone through —
  // to prove the whole cleanup is one transaction: that first delete must
  // be rolled back too, not left half-done.
  await page.addInitScript(() => {
    if (sessionStorage.getItem('test:failCleanupDelete') !== '1') return
    let deletes = 0
    const original = IDBObjectStore.prototype.delete
    IDBObjectStore.prototype.delete = function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['delete']>) {
      if (this.name === 'pendingReceipts' && ++deletes === 2) {
        throw new DOMException('Simulated storage failure', 'UnknownError')
      }
      return original.apply(this, args)
    }
  })

  await page.goto('/')
  await seedOldDevice(page, [
    { id: 1, tripId: 101, status: 'done', reviewed: true, photoBytes: 1000 },
    { id: 2, tripId: 101, status: 'done', reviewed: true, photoBytes: 1000 },
    { id: 3, tripId: 102, status: 'done', reviewed: true, photoBytes: 1000 },
  ])
  await page.evaluate(() => sessionStorage.setItem('test:failCleanupDelete', '1'))
  await page.reload()

  const error = page.getByTestId('receipt-cleanup-error')
  await expect(error).toBeVisible()
  await expect(error).toContainText("Couldn't clear old receipt photos")
  await expect(error).toContainText('Simulated storage failure')
  await expect(error).toContainText('Nothing was deleted')
  await expect(page.getByTestId('receipt-cleanup-notice')).toHaveCount(0)
  expect(await readDb(page)).toEqual({ receiptIds: [1, 2, 3], marker: null })

  await page.evaluate(() => sessionStorage.removeItem('test:failCleanupDelete'))
  await page.reload()

  await expect(page.getByTestId('receipt-cleanup-notice')).toContainText('removed 3 receipt photos')
  await expect(page.getByTestId('receipt-cleanup-error')).toHaveCount(0)
  const after = await readDb(page)
  expect(after.receiptIds).toEqual([])
  expect(after.marker).toMatchObject({ removed: 3 })
})
