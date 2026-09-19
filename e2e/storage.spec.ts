import { expect, test, type Page } from './fixtures'

// The Storage card on Settings: receipt photos (exact, from the database)
// against the rest (the browser's estimate — split by type on Chromium,
// a bare total elsewhere).

const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

/** Replaces the browser's storage estimate before the app loads; `null` removes the API. */
async function fakeEstimate(page: Page, estimate: { usage: number; usageDetails?: Record<string, number> } | 'reject' | null) {
  await page.addInitScript((estimate) => {
    const value =
      estimate === null
        ? undefined
        : estimate === 'reject'
          ? () => Promise.reject(new DOMException('Simulated estimate failure', 'UnknownError'))
          : () => Promise.resolve({ quota: 1e9, ...estimate })
    Object.defineProperty(StorageManager.prototype, 'estimate', { value, configurable: true })
  }, estimate)
}

async function openSettings(page: Page) {
  await page.getByTestId('nav-settings').click()
  await expect(page.getByTestId('storage-section')).toBeVisible()
}

/** Exact bytes of every receipt photo in the database, read directly. */
function photoBytes(page: Page): Promise<number[]> {
  return page.evaluate(
    () =>
      new Promise<number[]>((resolve, reject) => {
        const request = indexedDB.open('grocery-buddy')
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const all = request.result.transaction('pendingReceipts').objectStore('pendingReceipts').getAll()
          all.onerror = () => reject(all.error)
          all.onsuccess = () => {
            request.result.close()
            resolve(all.result.filter((r) => r.imageBlob).map((r) => (r.imageBlob as Blob).size))
          }
        }
      }),
  )
}

test('real figures render: a total, photos split out, and the rest broken down', async ({ page }) => {
  await page.route('**/api/extract-receipt', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ purchaseDate: null, items: [] }) }),
  )
  await page.goto('/')
  await openSettings(page)

  const size = /^\d+(,\d)? (Byte|kB|MB|GB)$/
  await expect(page.getByTestId('storage-total')).toContainText('Total used')
  await expect(page.getByTestId('storage-total').locator('span').last()).toHaveText(size)
  await expect(page.getByTestId('storage-photos')).toHaveText(/^Receipt photos \(0\)\s*0 Byte$/)
  await expect(page.getByTestId('storage-trip-data').locator('span').last()).toHaveText(size)
  await expect(page.getByTestId('storage-app-files').locator('span').last()).toHaveText(size)
  await expect(page.getByTestId('storage-note')).toHaveText("The browser's own estimate, rounded.")

  // A receipt photo shows up with its exact stored size (under 1 kB here).
  await page.getByTestId('nav-shopping').click()
  await page.getByTestId('receipt-capture-input').setInputFiles({ name: 'receipt.png', mimeType: 'image/png', buffer: Buffer.from(PNG_BASE64, 'base64') })
  await expect(page.getByTestId('receipt-item')).toHaveCount(1)
  const bytes = await photoBytes(page)
  expect(bytes).toHaveLength(1)
  expect(bytes[0]).toBeLessThan(1000)
  await openSettings(page)
  await expect(page.getByTestId('storage-photos')).toHaveText(new RegExp(`^Receipt photos \\(1\\)\\s*${bytes[0]} Byte$`))
})

test('Chromium-style details: trip data is IndexedDB minus photos, app files are everything else', async ({ page }) => {
  await fakeEstimate(page, { usage: 3_500_000, usageDetails: { indexedDB: 2_000_000, caches: 1_400_000, serviceWorkerRegistrations: 100_000 } })
  await page.goto('/')
  await openSettings(page)

  await expect(page.getByTestId('storage-total')).toHaveText(/Total used\s*3,5 MB/)
  await expect(page.getByTestId('storage-photos')).toHaveText(/Receipt photos \(0\)\s*0 Byte/)
  await expect(page.getByTestId('storage-trip-data')).toHaveText(/Trips & lists\s*2 MB/)
  await expect(page.getByTestId('storage-app-files')).toHaveText(/App files\s*1,5 MB/)
  await expect(page.getByTestId('storage-rest')).toHaveCount(0)
})

test('a browser that reports only a total shows photos against everything else', async ({ page }) => {
  await fakeEstimate(page, { usage: 12_340_000 })
  await page.goto('/')
  await openSettings(page)

  await expect(page.getByTestId('storage-total')).toHaveText(/Total used\s*12,3 MB/)
  await expect(page.getByTestId('storage-rest')).toHaveText(/Everything else\s*12,3 MB/)
  await expect(page.getByTestId('storage-trip-data')).toHaveCount(0)
  await expect(page.getByTestId('storage-app-files')).toHaveCount(0)
})

test('a browser without a storage estimate says so and still shows photos', async ({ page }) => {
  await fakeEstimate(page, null)
  await page.goto('/')
  await openSettings(page)

  await expect(page.getByTestId('storage-note')).toHaveText("This browser doesn't report how much space the app uses.")
  await expect(page.getByTestId('storage-photos')).toBeVisible()
  await expect(page.getByTestId('storage-total')).toHaveCount(0)
})

test('a failing storage estimate is shown, not hidden', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  await fakeEstimate(page, 'reject')
  await page.goto('/')
  await openSettings(page)

  await expect(page.getByTestId('storage-estimate-error')).toHaveText("Couldn't measure storage: Simulated estimate failure")
  await expect(page.getByTestId('storage-photos')).toBeVisible()
  expect(errors.some((e) => e.includes('the browser could not estimate storage use'))).toBe(true)
})

test('failing to read the photos is shown, not hidden', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('shopping-list')).not.toHaveAttribute('data-trip-id', '')
  // Only after Shopping has loaded, so just the Storage card's read fails.
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.openCursor
    IDBObjectStore.prototype.openCursor = function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['openCursor']>) {
      if (this.name === 'pendingReceipts') throw new DOMException('Simulated read failure', 'UnknownError')
      return original.apply(this, args)
    }
  })
  await page.getByTestId('nav-settings').click()

  await expect(page.getByTestId('storage-error')).toContainText("Couldn't measure storage:")
  await expect(page.getByTestId('storage-error')).toContainText('Simulated read failure')
  // The rest of Settings is unaffected.
  await expect(page.getByTestId('backup-section')).toBeVisible()
})

test('storage figures are translated', async ({ page }) => {
  await fakeEstimate(page, { usage: 3_500_000, usageDetails: { indexedDB: 2_000_000, caches: 1_500_000 } })
  await page.goto('/')
  await openSettings(page)
  await page.getByTestId('settings-language').selectOption('ru')

  await expect(page.getByTestId('storage-section')).toContainText('Память')
  await expect(page.getByTestId('storage-total')).toHaveText(/Всего занято\s*3,5 МБ/)
  await expect(page.getByTestId('storage-photos')).toHaveText(/Фото чеков \(0\)\s*0 Б/)
  await expect(page.getByTestId('storage-trip-data')).toHaveText(/Покупки и списки\s*2 МБ/)
  await expect(page.getByTestId('storage-app-files')).toHaveText(/Файлы приложения\s*1,5 МБ/)
  await expect(page.getByTestId('storage-note')).toHaveText('Оценка браузера, округлённая.')
})
