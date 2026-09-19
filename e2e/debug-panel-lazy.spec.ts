import { expect, test, type Page } from './fixtures'
// Drives the Debug tools panel, which is hidden unless enabled for the session.
test.use({ debugTools: true })

// Counts whole-table reads of the `items` object store at the IndexedDB
// layer. Only Debug tools reads every item (db.items.toArray()); every real
// feature queries items through the tripId index instead — so this count is
// a direct signal for "is the debug panel's live query running".
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __fullItemsReads: number }
    w.__fullItemsReads = 0
    for (const fn of ['getAll', 'openCursor'] as const) {
      const orig = IDBObjectStore.prototype[fn] as (...args: unknown[]) => IDBRequest
      ;(IDBObjectStore.prototype as unknown as Record<string, unknown>)[fn] = function (
        this: IDBObjectStore,
        ...args: unknown[]
      ) {
        // Dexie 4 passes getAll an options object ({ query, direction })
        // where supported, a bare key range (or nothing) otherwise.
        const first = args[0] as { query?: unknown } | null | undefined
        const query = first && typeof first === 'object' && !(first instanceof IDBKeyRange) ? first.query : first
        if (this.name === 'items' && (query === undefined || query === null)) w.__fullItemsReads++
        return orig.apply(this, args)
      }
    }
  })
})

const fullItemsReads = (page: Page) =>
  page.evaluate(() => (window as unknown as { __fullItemsReads: number }).__fullItemsReads)

async function addItem(page: Page, name: string) {
  await page.getByTestId('add-item-input').fill(name)
  await page.getByTestId('add-item-submit').click()
  await expect(page.getByTestId('shopping-list-item').last().locator('input[type="text"]')).toHaveValue(name)
}

test('collapsed Debug tools renders no contents and runs no queries, even as items change', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('debug-panel')).toBeVisible()

  await addItem(page, 'Milk')
  await addItem(page, 'Eggs')
  await page.getByTestId('shopping-list-item').first().locator('input[type="text"]').fill('Milk 1L')
  await page.getByTestId('shopping-list-item').first().locator('input[type="checkbox"]').click()
  // Give any (wrongly) subscribed live query time to re-run.
  await page.waitForTimeout(500)

  await expect(page.getByTestId('debug-panel').locator('h2')).toHaveCount(0)
  await expect(page.getByTestId('debug-trip')).toHaveCount(0)
  expect(await fullItemsReads(page)).toBe(0)
})

test('opening Debug tools mounts its contents and queries; closing it unmounts them again', async ({ page }) => {
  await page.goto('/')
  await addItem(page, 'Milk')

  await page.getByTestId('debug-panel-toggle').click()
  await expect(page.getByTestId('debug-trip')).toHaveCount(1)
  await expect(page.getByTestId('debug-item')).toContainText('Milk')
  // Sanity check on the probe itself: an open panel does read the whole
  // items table, so a 0 above genuinely means "not running".
  await expect.poll(() => fullItemsReads(page)).toBeGreaterThan(0)

  await page.getByTestId('debug-panel-toggle').click()
  await expect(page.getByTestId('debug-trip')).toHaveCount(0)

  const readsAfterClose = await fullItemsReads(page)
  await addItem(page, 'Eggs')
  await page.waitForTimeout(500)
  expect(await fullItemsReads(page)).toBe(readsAfterClose)
})
