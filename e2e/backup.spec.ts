import * as fs from 'node:fs/promises'
import { expect, test, type Page } from './fixtures'

async function addItem(page: Page, name: string) {
  await page.getByTestId('add-item-input').fill(name)
  await page.getByTestId('add-item-submit').click()
  await expect(page.getByTestId('shopping-list-item').last().locator('input[type="text"]')).toHaveValue(name)
}

async function itemNames(page: Page): Promise<string[]> {
  return page
    .getByTestId('shopping-list-item')
    .locator('input[type="text"]')
    .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value))
}

async function goToCustomize(page: Page) {
  await page.getByTestId('nav-customize').click()
  await expect(page.getByTestId('customize-page')).toBeVisible()
}

async function goToHistory(page: Page) {
  await page.getByTestId('nav-history').click()
  await expect(page.getByTestId('history-page')).toBeVisible()
}

async function exportBackup(page: Page): Promise<{ suggestedFilename: string; content: string }> {
  await goToHistory(page)
  const downloadPromise = page.waitForEvent('download')
  await page.getByTestId('backup-export-button').click()
  const download = await downloadPromise
  const path = await download.path()
  if (!path) throw new Error('download had no path — Playwright failed to save it')
  const content = await fs.readFile(path, 'utf-8')
  return { suggestedFilename: download.suggestedFilename(), content }
}

test('the backup section lives on History, not Customize', async ({ page }) => {
  await page.goto('/')

  await goToHistory(page)
  await expect(page.getByTestId('backup-section')).toBeVisible()

  await goToCustomize(page)
  await expect(page.getByTestId('backup-section')).toHaveCount(0)
})

test('export produces a JSON backup matching the current data', async ({ page }) => {
  await page.goto('/')

  await addItem(page, 'Milk')
  await addItem(page, 'Bread')

  await goToCustomize(page)
  const frozen = page.locator('[data-testid="category-accordion"][data-category-key="frozen"]')
  await frozen.locator('summary').click()
  await frozen.getByTestId('category-note-input').fill('nuggets, frozen pizza')
  await frozen.getByTestId('category-note-submit').click()
  await expect(frozen.getByTestId('category-note')).toHaveCount(1)

  const today = new Date().toISOString().slice(0, 10)
  const { suggestedFilename, content } = await exportBackup(page)

  expect(suggestedFilename).toBe(`grocery-buddy-backup-${today}.json`)

  const backup = JSON.parse(content)
  expect(backup.schemaVersion).toBe(1)
  expect(typeof backup.exportedAt).toBe('string')

  expect(backup.tables.trips).toHaveLength(1)
  expect(backup.tables.trips[0].status).toBe('draft')

  const itemNamesInBackup = backup.tables.items.map((item: { name: string }) => item.name).sort()
  expect(itemNamesInBackup).toEqual(['Bread', 'Milk'])

  expect(backup.tables.categoryNotes).toHaveLength(1)
  expect(backup.tables.categoryNotes[0].text).toBe('nuggets, frozen pizza')
  expect(backup.tables.categoryNotes[0].categoryKey).toBe('frozen')

  expect(backup.tables.appState.some((entry: { key: string }) => entry.key === 'activeTripId')).toBe(true)
  expect(backup.tables.pendingReceipts).toEqual([])
})

test('importing a backup restores all tables into a cleared database', async ({ page }) => {
  await page.goto('/')

  await addItem(page, 'Milk')
  await addItem(page, 'Bread')

  await goToCustomize(page)
  const frozen = page.locator('[data-testid="category-accordion"][data-category-key="frozen"]')
  await frozen.locator('summary').click()
  await frozen.getByTestId('category-note-input').fill('nuggets')
  await frozen.getByTestId('category-note-submit').click()
  await expect(frozen.getByTestId('category-note')).toHaveCount(1)

  const { content } = await exportBackup(page)

  // Wipe everything (same "start over" action a real cache-clear/reinstall
  // would leave the user with) so import is restoring into a genuinely
  // fresh database, not just upserting on top of what's already there.
  await page.getByTestId('nav-shopping').click()
  await page.getByTestId('debug-panel-toggle').click()
  await page.getByTestId('debug-reset-all').click()
  await expect.poll(() => itemNames(page)).toEqual([])

  await goToCustomize(page)
  // Click (toggle) isn't reliable here: TabTransition can preserve the
  // previous Customize instance's mounted state (including this accordion's
  // open/closed state) rather than remounting fresh, if this navigation
  // lands within its 300ms animation window of the earlier switch away —
  // see TabTransition's own doc comment. Setting `open` directly sidesteps
  // that ambiguity instead of guessing the current toggle state.
  await frozen.evaluate((el) => {
    ;(el as HTMLDetailsElement).open = true
  })
  await expect(frozen.getByTestId('category-notes-empty')).toBeVisible()

  await goToHistory(page)
  await page.getByTestId('backup-import-input').setInputFiles({
    name: 'restore-me.json',
    mimeType: 'application/json',
    buffer: Buffer.from(content, 'utf-8'),
  })

  await expect(page.getByTestId('backup-import-confirm')).toBeVisible()
  await expect(page.getByTestId('backup-import-confirm')).toContainText('2 items')
  await page.getByTestId('backup-import-confirm-yes').click()

  await expect(page.getByTestId('backup-import-success')).toBeVisible()
  await expect(page.getByTestId('backup-import-confirm')).toHaveCount(0)

  await goToCustomize(page)
  await frozen.evaluate((el) => {
    ;(el as HTMLDetailsElement).open = true
  })
  await expect(frozen.getByTestId('category-note')).toHaveCount(1)
  await expect(frozen.getByTestId('category-note')).toContainText('nuggets')

  await page.getByTestId('nav-shopping').click()
  await expect.poll(() => itemNames(page)).toEqual(['Milk', 'Bread'])

  // Survives reload — really written to Dexie, not just held in memory.
  await page.reload()
  await expect.poll(() => itemNames(page)).toEqual(['Milk', 'Bread'])
})

test('importing a malformed file shows a clear error instead of crashing', async ({ page }) => {
  await page.goto('/')
  await goToHistory(page)

  await page.getByTestId('backup-import-input').setInputFiles({
    name: 'not-json.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{ this is not valid JSON', 'utf-8'),
  })

  await expect(page.getByTestId('backup-import-error')).toBeVisible()
  await expect(page.getByTestId('backup-import-error')).toContainText('not valid JSON')
  await expect(page.getByTestId('backup-import-confirm')).toHaveCount(0)

  // The page is still functional — a bad file didn't crash the app.
  await expect(page.getByTestId('history-page')).toBeVisible()
})

test('importing valid JSON that is not a Grocery Buddy backup shows a clear error', async ({ page }) => {
  await page.goto('/')
  await goToHistory(page)

  await page.getByTestId('backup-import-input').setInputFiles({
    name: 'random.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ hello: 'world' }), 'utf-8'),
  })

  await expect(page.getByTestId('backup-import-error')).toBeVisible()
  await expect(page.getByTestId('backup-import-error')).toContainText('not a Grocery Buddy backup')
  await expect(page.getByTestId('backup-import-confirm')).toHaveCount(0)
})

test('cancelling the import confirmation makes no changes', async ({ page }) => {
  await page.goto('/')
  await addItem(page, 'Milk')

  const { content } = await exportBackup(page)

  await page.getByTestId('backup-import-input').setInputFiles({
    name: 'restore-me.json',
    mimeType: 'application/json',
    buffer: Buffer.from(content, 'utf-8'),
  })
  await expect(page.getByTestId('backup-import-confirm')).toBeVisible()

  await page.getByTestId('backup-import-confirm-cancel').click()
  await expect(page.getByTestId('backup-import-confirm')).toHaveCount(0)
  await expect(page.getByTestId('backup-import-success')).toHaveCount(0)

  await page.getByTestId('nav-shopping').click()
  await expect.poll(() => itemNames(page)).toEqual(['Milk'])
})
