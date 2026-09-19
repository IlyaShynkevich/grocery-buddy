import * as fs from 'node:fs/promises'
import { expect, openDebugPanel, test, type Page } from './fixtures'

// Same 1x1 PNG fixture used in the other receipt specs.
const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
const PNG_DATA_URL = `data:image/png;base64,${PNG_BASE64}`

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
  await page.getByTestId('receipt-capture-input').setInputFiles({
    name: 'receipt.png',
    mimeType: 'image/png',
    buffer: Buffer.from(PNG_BASE64, 'base64'),
  })
  await expect(page.getByTestId('receipt-item')).toHaveCount(before + 1)
}

async function goToHistory(page: Page) {
  await page.getByTestId('nav-history').click()
  await expect(page.getByTestId('history-page')).toBeVisible()
}

async function exportBackup(page: Page) {
  await goToHistory(page)
  const downloadPromise = page.waitForEvent('download')
  await page.getByTestId('backup-export-button').click()
  const path = await (await downloadPromise).path()
  if (!path) throw new Error('download had no path — Playwright failed to save it')
  return fs.readFile(path, 'utf-8')
}

async function chooseBackupFile(page: Page, content: string) {
  await page.getByTestId('backup-import-input').setInputFiles({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(content, 'utf-8'),
  })
}

/** A minimal backup with one draft trip (id 1, active) and the given receipt rows. */
function backupWith(schemaVersion: number, receipts: Record<string, unknown>[]) {
  return JSON.stringify({
    schemaVersion,
    exportedAt: '2026-09-01T10:00:00.000Z',
    tables: {
      trips: [{ id: 1, date: '2026-09-01', total: 1.19, status: 'draft', createdAt: 1 }],
      items: [{ id: 1, tripId: 1, name: 'Restored milk', price: 1.19, category: 'dairy', essentialOverride: null, source: 'ai', isDiscount: false, checked: false }],
      categoryNotes: [],
      pendingReceipts: receipts,
      appState: [{ key: 'activeTripId', value: 1 }],
    },
  })
}

const receiptRow = (id: number, status: string, imageBlob?: string) => ({
  id,
  tripId: 1,
  capturedAt: 1000 + id,
  status,
  reviewed: status === 'done' ? true : undefined,
  ...(imageBlob === undefined ? {} : { imageBlob }),
})

async function receiptCount(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('grocery-buddy')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const count = await new Promise<number>((resolve, reject) => {
      const request = db.transaction('pendingReceipts').objectStore('pendingReceipts').count()
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    db.close()
    return count
  })
}

test('export leaves out photos of processed receipts but keeps photos of unprocessed ones', async ({ page }) => {
  await mockExtraction(page)
  await page.goto('/')

  await captureReceipt(page)
  await page.getByTestId('receipt-process-button').click()
  await page.getByTestId('receipt-review-confirm').click()
  await expect(page.getByTestId('receipt-status')).toHaveText('Processed')

  await captureReceipt(page) // never processed

  const backup = JSON.parse(await exportBackup(page))
  expect(backup.schemaVersion).toBe(3)
  const receipts: { status: string; imageBlob?: string }[] = backup.tables.pendingReceipts
  expect(receipts).toHaveLength(2)

  const processed = receipts.find((r) => r.status === 'done')
  const unprocessed = receipts.find((r) => r.status === 'pending')
  expect(processed).toBeDefined()
  expect(processed).not.toHaveProperty('imageBlob')
  expect(unprocessed?.imageBlob).toMatch(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/)
})

test('a new-format backup round-trips: the processed receipt shows "no photo", the unprocessed one can still be processed', async ({
  page,
}) => {
  await mockExtraction(page)
  await page.goto('/')
  await captureReceipt(page)
  await page.getByTestId('receipt-process-button').click()
  await page.getByTestId('receipt-review-confirm').click()
  await captureReceipt(page)

  const content = await exportBackup(page)

  await page.getByTestId('nav-shopping').click()
  await openDebugPanel(page)
  await page.getByTestId('debug-reset-all').click()
  await expect(page.getByTestId('receipt-item')).toHaveCount(0)

  await goToHistory(page)
  await chooseBackupFile(page, content)
  await expect(page.getByTestId('backup-import-confirm')).toContainText('2 receipts (1 with photo)')
  await page.getByTestId('backup-import-confirm-yes').click()
  await expect(page.getByTestId('backup-import-success')).toBeVisible()

  await page.getByTestId('nav-shopping').click()
  const rows = page.getByTestId('receipt-item')
  await expect(rows).toHaveCount(2)
  const processedRow = rows.filter({ hasText: 'Processed' })
  const unprocessedRow = rows.filter({ hasText: 'Waiting to process' })
  await expect(processedRow.getByTestId('receipt-thumbnail-missing')).toBeVisible()
  await expect(unprocessedRow.getByRole('img', { name: 'Receipt thumbnail' })).toBeVisible()

  await unprocessedRow.getByTestId('receipt-process-button').click()
  await expect(page.getByTestId('receipt-review-panel')).toBeVisible()
})

test('an old-format (v1) backup, with photos on every receipt, still imports', async ({ page }) => {
  await page.goto('/')
  await goToHistory(page)

  await chooseBackupFile(page, backupWith(1, [receiptRow(1, 'done', PNG_DATA_URL), receiptRow(2, 'pending', PNG_DATA_URL)]))
  await expect(page.getByTestId('backup-import-confirm')).toContainText('2 receipts (2 with photos)')
  await page.getByTestId('backup-import-confirm-yes').click()
  await expect(page.getByTestId('backup-import-success')).toBeVisible()

  await page.getByTestId('nav-shopping').click()
  await expect(page.getByTestId('receipt-item')).toHaveCount(2)
  await expect(page.getByRole('img', { name: 'Receipt thumbnail' })).toHaveCount(2)
  await expect(page.getByTestId('receipt-process-button')).toHaveCount(1)
})

test('a backup row that needs processing but has no photo is rejected loudly, and nothing is imported', async ({
  page,
}) => {
  await page.goto('/')
  await goToHistory(page)

  await chooseBackupFile(page, backupWith(2, [receiptRow(7, 'pending')]))

  const error = page.getByTestId('backup-import-error')
  await expect(error).toBeVisible()
  await expect(error).toContainText('Receipt #7 (pending) has no photo')
  await expect(error).toContainText('Nothing was imported')
  await expect(page.getByTestId('backup-import-confirm')).toHaveCount(0)
  expect(await receiptCount(page)).toBe(0)
})

for (const [label, imageBlob] of [
  ['the string "undefined"', 'undefined'],
  ['a relative URL', '/index.html'],
  ['a non-image data URL', 'data:text/html;base64,PGh0bWw+PC9odG1sPg=='],
  ['a JSON null', null],
] as const) {
  test(`a receipt photo that is ${label} is rejected loudly instead of being fetched and stored`, async ({ page }) => {
    // The original bug: fetch() resolved whatever it was given and stored
    // the response — e.g. the app's own HTML — as the photo.
    let fetchedNonDataUrl = false
    page.on('request', (request) => {
      if (!request.url().startsWith('data:') && /\/(undefined|index\.html)$/.test(request.url())) fetchedNonDataUrl = true
    })
    await page.goto('/')
    await goToHistory(page)

    await chooseBackupFile(page, backupWith(2, [receiptRow(3, 'done', imageBlob as string)]))

    const error = page.getByTestId('backup-import-error')
    await expect(error).toBeVisible()
    await expect(error).toContainText("Receipt #3's photo is not a valid image")
    await expect(page.getByTestId('backup-import-confirm')).toHaveCount(0)
    expect(await receiptCount(page)).toBe(0)
    expect(fetchedNonDataUrl).toBe(false)
  })
}
