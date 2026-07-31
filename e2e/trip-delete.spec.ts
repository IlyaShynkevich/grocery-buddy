import { expect, test, type Page } from '@playwright/test'

async function addItem(page: Page, name: string) {
  await page.getByTestId('add-item-input').fill(name)
  await page.getByTestId('add-item-submit').click()
  await expect(page.getByTestId('shopping-list-item').last().locator('input[type="text"]')).toHaveValue(name)
}

async function itemNames(page: Page): Promise<string[]> {
  return page.getByTestId('shopping-list-item').locator('input[type="text"]').evaluateAll((inputs) =>
    inputs.map((input) => (input as HTMLInputElement).value),
  )
}

/** Saves the active trip and returns the id of the trip that was just completed. */
async function saveAndGetCompletedTripId(page: Page): Promise<string> {
  const tripId = await page.getByTestId('shopping-list').getAttribute('data-trip-id')
  await page.getByTestId('save-trip-button').click()
  await expect.poll(() => page.getByTestId('shopping-list').getAttribute('data-trip-id')).not.toBe(tripId)
  return tripId ?? ''
}

/**
 * Pins a trip as "active" directly in IndexedDB, bypassing Dexie entirely —
 * same technique and reasoning as history-improvements.spec.ts's
 * `setTripDate`: a raw IndexedDB write doesn't fire Dexie's own liveQuery
 * reactivity, unlike writing through `db.appState.put`. That distinction
 * matters here specifically: `useActiveTripId` self-heals (reassigns the
 * pointer back to a real draft) the moment any component using it is
 * mounted and sees the pointer resolve to a non-draft trip — which, now
 * that Debug tools only renders on the Shopping List tab (the same tab
 * that mounts that hook), is unavoidable to reach through the debug panel's
 * own "Make active" button. Writing the pointer directly sidesteps that
 * entirely, and works precisely because Dexie's read layer still sees a
 * raw-written value correctly (it's the same underlying IndexedDB data) —
 * only its *live* reactivity is bypassed.
 */
async function setActiveTripPointer(page: Page, tripId: string) {
  await page.evaluate(
    (tripIdNum) => {
      return new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('grocery-buddy')
        req.onerror = () => reject(req.error)
        req.onsuccess = () => {
          const idb = req.result
          const tx = idb.transaction('appState', 'readwrite')
          tx.objectStore('appState').put({ key: 'activeTripId', value: tripIdNum })
          tx.oncomplete = () => {
            idb.close()
            resolve()
          }
          tx.onerror = () => reject(tx.error)
        }
      })
    },
    Number(tripId),
  )
}

test('deleting a trip requires confirmation, and cancelling keeps the trip', async ({ page }) => {
  await page.goto('/')

  await addItem(page, 'Milk')
  await saveAndGetCompletedTripId(page)

  await page.getByTestId('nav-history').click()
  await page.getByTestId('history-trip').click()
  await expect(page.getByTestId('trip-detail-page')).toBeVisible()

  await page.getByTestId('trip-detail-delete').click()
  await expect(page.getByTestId('trip-detail-delete-confirm')).toBeVisible()

  // Cancelling leaves the trip untouched.
  await page.getByTestId('trip-detail-delete-cancel').click()
  await expect(page.getByTestId('trip-detail-delete-confirm')).toHaveCount(0)
  await expect(page.getByTestId('trip-detail-page')).toBeVisible()
  await expect(page.getByTestId('trip-detail-item')).toContainText('Milk')

  await page.getByTestId('nav-history').click()
  await expect(page.getByTestId('history-trip')).toHaveCount(1)
})

test('confirming delete removes the trip and returns to history', async ({ page }) => {
  await page.goto('/')

  await addItem(page, 'Milk')
  await addItem(page, 'Bread')
  await saveAndGetCompletedTripId(page)

  await page.getByTestId('nav-history').click()
  await expect(page.getByTestId('history-trip')).toHaveCount(1)
  await page.getByTestId('history-trip').click()
  await expect(page.getByTestId('trip-detail-page')).toBeVisible()

  await page.getByTestId('trip-detail-delete').click()
  await page.getByTestId('trip-detail-delete-yes').click()

  // Deleting navigates back to history, where the trip is now gone.
  await expect(page.getByTestId('history-page')).toBeVisible()
  await expect(page.getByTestId('history-trip')).toHaveCount(0)

  // The underlying data is really gone, not just hidden from the list.
  await page.reload()
  await page.getByTestId('nav-history').click()
  await expect(page.getByTestId('history-trip')).toHaveCount(0)
})

test('deleting the trip currently pinned as active starts a fresh empty draft', async ({ page }) => {
  await page.goto('/')

  await addItem(page, 'Milk')
  const trip1Id = await saveAndGetCompletedTripId(page)

  // Pin the now-completed trip1 as "active" — this is a debug-only edge
  // case (real navigation never does this, since the active pointer only
  // ever legitimately targets a draft), but it's exactly the case
  // deleteTrip's pointer-reassignment guards against. Done via a raw
  // IndexedDB write (see setActiveTripPointer) rather than the debug
  // panel's own "Make active" button — Debug tools only renders on the
  // Shopping List tab, the same tab whose mounted `useActiveTripId` would
  // otherwise immediately self-heal (undo) this exact write.
  await setActiveTripPointer(page, trip1Id)

  await page.getByTestId('nav-history').click()
  await page.getByTestId('history-trip').click()
  await expect(page.getByTestId('trip-detail-page')).toBeVisible()

  await page.getByTestId('trip-detail-delete').click()
  await page.getByTestId('trip-detail-delete-yes').click()
  await expect(page.getByTestId('history-page')).toBeVisible()
  await expect(page.getByTestId('history-trip')).toHaveCount(0)

  // The app must never be left without something to shop into: the active
  // pointer was reassigned to a brand new empty draft. Poll the attribute
  // itself (not just itemNames) — the trip only resolves once the async
  // useActiveTripId effect runs, and data-trip-id is '' until then.
  await page.getByTestId('nav-shopping').click()
  await expect.poll(() => page.getByTestId('shopping-list').getAttribute('data-trip-id')).not.toBe('')
  await expect.poll(() => itemNames(page)).toEqual([])
  const newTripId = await page.getByTestId('shopping-list').getAttribute('data-trip-id')
  expect(newTripId).not.toBe(trip1Id)

  const newTripRow = page.locator(`[data-testid="debug-trip"][data-trip-id="${newTripId}"]`)
  await expect(newTripRow).toHaveAttribute('data-active', 'true')
})
