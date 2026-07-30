import { expect, test, type Page } from '@playwright/test'

async function addItem(page: Page, name: string) {
  await page.getByTestId('add-item-input').fill(name)
  await page.getByTestId('add-item-submit').click()
  await expect(page.getByTestId('shopping-list-item').last().locator('input[type="text"]')).toHaveValue(name)
}

async function itemNames(page: Page): Promise<string[]> {
  const inputs = await page.getByTestId('shopping-list-item').locator('input[type="text"]').all()
  return Promise.all(inputs.map((input) => input.inputValue()))
}

/** Saves the active trip and returns the id of the trip that was just completed. */
async function saveAndGetCompletedTripId(page: Page): Promise<string> {
  const tripId = await page.getByTestId('shopping-list').getAttribute('data-trip-id')
  await page.getByTestId('save-trip-button').click()
  await expect.poll(() => page.getByTestId('shopping-list').getAttribute('data-trip-id')).not.toBe(tripId)
  return tripId ?? ''
}

// The debug panel is collapsed by default (native <details>) — its contents
// stay in the DOM either way, but any button inside needs the panel opened
// first or Playwright's actionability check on .click() fails as "hidden".
async function openDebugPanel(page: Page) {
  await page.getByTestId('debug-panel-toggle').click()
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
  await openDebugPanel(page)

  await addItem(page, 'Milk')
  const trip1Id = await saveAndGetCompletedTripId(page)

  // Pin the now-completed trip1 as "active" via the debug panel — this is a
  // debug-only affordance (real navigation never does this, since the active
  // pointer only ever legitimately targets a draft), but it's exactly the
  // edge case deleteTrip's pointer-reassignment guards against.
  await page.getByTestId('nav-history').click()
  const trip1Row = page.locator(`[data-testid="debug-trip"][data-trip-id="${trip1Id}"]`)
  await trip1Row.getByTestId('debug-make-active').click()
  await expect(trip1Row).toHaveAttribute('data-active', 'true')

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
