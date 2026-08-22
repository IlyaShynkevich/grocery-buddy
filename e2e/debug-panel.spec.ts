import { expect, test, type Page } from './fixtures'

async function addItem(page: Page, name: string) {
  await page.getByTestId('add-item-input').fill(name)
  await page.getByTestId('add-item-submit').click()
  await expect(page.getByTestId('shopping-list-item').last().locator('input[type="text"]')).toHaveValue(name)
}

/** Saves the active trip and returns the id of the trip that was just completed. */
async function saveAndGetCompletedTripId(page: Page): Promise<string> {
  const tripId = await page.getByTestId('shopping-list').getAttribute('data-trip-id')
  await page.getByTestId('save-trip-button').click()
  await expect.poll(() => page.getByTestId('shopping-list').getAttribute('data-trip-id')).not.toBe(tripId)
  return tripId ?? ''
}

test('DB Debug Panel is collapsed by default and can be opened/closed via its toggle', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByTestId('debug-panel-toggle')).toBeVisible()
  // Collapsed: contents exist (native <details>) but aren't rendered visible.
  await expect(page.getByTestId('debug-create-trip')).not.toBeVisible()

  await page.getByTestId('debug-panel-toggle').click()
  await expect(page.getByTestId('debug-create-trip')).toBeVisible()

  await page.getByTestId('debug-panel-toggle').click()
  await expect(page.getByTestId('debug-create-trip')).not.toBeVisible()
})

test("editing a completed trip's date via the debug panel updates it directly in Dexie", async ({ page }) => {
  await page.goto('/')

  // A *completed* trip, not a bare draft — this is the realistic target for
  // the feature (backdating a trip re-entered by hand after a data loss,
  // which is saved/completed like any normal trip) and it sidesteps
  // refreshDraftDate (db.ts): that function intentionally resets whichever
  // draft trip is currently pinned active back to today every time the
  // active pointer resolves (see trip-date-refresh.spec.ts), which would
  // fight a manual date edit on a still-draft trip and isn't what this test
  // is about. Completed trips are never touched by refreshDraftDate.
  await addItem(page, 'Milk')
  const tripId = await saveAndGetCompletedTripId(page)

  await page.getByTestId('debug-panel-toggle').click()
  const row = page.locator(`[data-testid="debug-trip"][data-trip-id="${tripId}"]`)
  await expect(row).toBeVisible()

  const dateInput = row.getByTestId('debug-trip-date-input')
  await dateInput.fill('2026-06-15')
  await expect(dateInput).toHaveValue('2026-06-15')
  await expect(page.getByTestId('debug-trip-date-error')).toHaveCount(0)

  // Picked up by History's own live query too, not just this panel's local
  // state — confirms the write actually landed in Dexie's trips table with
  // the right value, not just in this input's own DOM state.
  await page.getByTestId('nav-history').click()
  await expect(page.locator(`[data-testid="history-trip"][data-trip-id="${tripId}"]`)).toContainText('15.06.2026')

  // Written straight through Dexie, not just held in React state — survives
  // a reload, same "really persisted" bar every other debug-panel mutation
  // in this suite is held to. Debug tools only renders on the Shopping List
  // tab, and the last-active tab (History, from just above) is what a
  // reload restores — switch back first or debug-panel-toggle never appears.
  await page.reload()
  await page.getByTestId('nav-shopping').click()
  await page.getByTestId('debug-panel-toggle').click()
  const rowAfterReload = page.locator(`[data-testid="debug-trip"][data-trip-id="${tripId}"]`)
  await expect(rowAfterReload.getByTestId('debug-trip-date-input')).toHaveValue('2026-06-15')
})
