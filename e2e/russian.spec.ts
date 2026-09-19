import { readFile } from 'node:fs/promises'
import { expect, openCustomize, test, type Page } from './fixtures'

// The rest of the suite runs in English with EUR (the defaults); this
// spec covers Russian (and BYN) end to end.

const LANGUAGE_KEY = 'grocery-buddy:language'
const CURRENCY_KEY = 'grocery-buddy:currency'

// 1x1 PNG, same fixture as the other receipt specs.
const SAMPLE_IMAGE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

/** Starts the page already in Russian — the setting as a returning user would have it saved. */
async function useRussian(page: Page) {
  await page.addInitScript(
    ([languageKey, currencyKey]) => {
      localStorage.setItem(languageKey, 'ru')
      localStorage.setItem(currencyKey, 'BYN')
    },
    [LANGUAGE_KEY, CURRENCY_KEY],
  )
}

interface SeedTrip {
  id: number
  date: string
  items: { name: string; price: number; category: string }[]
  currency?: string
}

/** Completed trips written with raw IndexedDB (after the app has created its schema), then reloaded. */
async function seedTrips(page: Page, trips: SeedTrip[]) {
  await page.evaluate(async (trips) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('grocery-buddy')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['trips', 'items'], 'readwrite')
      let itemId = 1000
      for (const trip of trips) {
        const total = trip.items.reduce((sum, item) => sum + item.price, 0)
        tx.objectStore('trips').put({
          id: trip.id,
          date: trip.date,
          total,
          status: 'complete',
          createdAt: trip.id,
          completedAt: trip.id,
          currency: trip.currency ?? 'EUR',
        })
        for (const item of trip.items) {
          tx.objectStore('items').put({
            id: itemId++,
            tripId: trip.id,
            ...item,
            essentialOverride: null,
            source: 'ai',
            isDiscount: false,
            checked: false,
          })
        }
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  }, trips)
  await page.reload()
}

const milk = (price = 1) => ({ name: 'Молоко', price, category: 'dairy' })

/**
 * Latin-letter words in the visible page — any English left untranslated.
 * The Debug tools panel is excluded (a developer tool, English on purpose),
 * as are names and codes that are the same in every language.
 */
async function englishLeftovers(page: Page): Promise<string[]> {
  const text = await page.evaluate(() => {
    const clone = document.body.cloneNode(true) as HTMLElement
    clone.querySelector('[data-testid="debug-panel"]')?.remove()
    document.body.append(clone)
    clone.style.position = 'absolute'
    const visible = clone.innerText
    clone.remove()
    return visible
  })
  // "English" is the language picker's own option — each language is
  // listed in itself, so the way back is always readable.
  const allowed = new Set(['Grocery', 'Buddy', 'Ilya', 'Shynkevich', 'EUR', 'BYN', 'Br', 'English'])
  return [...new Set(text.match(/[A-Za-z]{2,}/g) ?? [])].filter((word) => !allowed.has(word))
}

test('switching to Russian in Customize translates the app and survives a reload', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('nav-settings').click()
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()

  await page.getByTestId('settings-language').selectOption('ru')

  await expect(page.getByRole('heading', { name: 'Настройки' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru')
  await expect(page.getByTestId('nav-history')).toHaveAttribute('aria-label', 'История')
  // Language only — the currency setting is independent and stays EUR.
  await expect(page.getByTestId('settings-currency')).toHaveValue('EUR')
  await openCustomize(page)
  await expect(page.getByRole('heading', { name: 'Мои категории' })).toBeVisible()
  await expect(page.getByTestId('category-accordion-toggle').first()).toHaveText('Овощи и фрукты')
  await page.getByTestId('customize-back').click()
  await expect(page.getByTestId('settings-page')).toBeVisible()
  expect(await page.evaluate(([l, c]) => [localStorage.getItem(l), localStorage.getItem(c)], [LANGUAGE_KEY, CURRENCY_KEY])).toEqual(['ru', null])

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Настройки' })).toBeVisible()
  await expect(page.getByTestId('settings-language')).toHaveValue('ru')

  await page.getByTestId('settings-language').selectOption('en')
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
})

test('every main screen is fully in Russian — no English left over', async ({ page }) => {
  await useRussian(page)
  await page.goto('/')
  await page.getByTestId('add-item-input').fill('Хлеб')
  await page.getByTestId('add-item-submit').click()
  await seedTrips(page, [{ id: 101, date: '2026-08-10', items: [milk(), { name: 'Сыр', price: 5, category: 'dairy' }] }])

  await expect(page.getByRole('heading', { name: 'Список покупок' })).toBeVisible()
  expect(await englishLeftovers(page), 'Shopping List').toEqual([])

  for (const [tab, heading] of [
    ['nav-history', 'История'],
    ['nav-stats', 'Статистика'],
    ['nav-settings', 'Настройки'],
  ] as const) {
    await page.getByTestId(tab).click()
    await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible()
    await page.waitForTimeout(400) // tab slide animation
    expect(await englishLeftovers(page), heading).toEqual([])
  }

  await page.getByTestId('nav-history').click()
  await page.getByTestId('history-trip').click()
  await expect(page.getByTestId('trip-detail-page')).toBeVisible()
  expect(await englishLeftovers(page), 'trip detail').toEqual([])

  await openCustomize(page)
  await expect(page.getByRole('heading', { name: 'Мои категории', level: 1 })).toBeVisible()
  expect(await englishLeftovers(page), 'Customize').toEqual([])

  await page.getByTestId('nav-about').click()
  await expect(page.getByTestId('about-page')).toBeVisible()
  expect(await englishLeftovers(page), 'About').toEqual([])

  await page.getByTestId('nav-home').click()
  await expect(page.getByTestId('home-shop-button')).toHaveText('Начать покупки')
  expect(await englishLeftovers(page), 'Home').toEqual([])
})

test('item counts use Russian plural forms, and months use Russian names', async ({ page }) => {
  await useRussian(page)
  await page.goto('/')
  await seedTrips(page, [
    { id: 101, date: '2026-08-05', items: [milk()] },
    { id: 102, date: '2026-08-06', items: [milk(), milk(), milk()] },
    { id: 103, date: '2026-07-07', items: [milk(), milk(), milk(), milk(), milk()] },
  ])

  await page.getByTestId('nav-history').click()
  const rows = page.getByTestId('history-trip')
  await expect(rows.filter({ hasText: '05.08.2026' })).toContainText('1 товар —')
  await expect(rows.filter({ hasText: '06.08.2026' })).toContainText('3 товара —')
  await expect(rows.filter({ hasText: '07.07.2026' })).toContainText('5 товаров —')
  await expect(page.getByTestId('history-month-header')).toHaveText(['Август 2026 г.', 'Июль 2026 г.'])
})

test('Stats shows translated labels and category names', async ({ page }) => {
  await useRussian(page)
  await page.goto('/')
  await seedTrips(page, [{ id: 101, date: '2026-08-05', items: [milk(2), { name: 'Сок', price: 3, category: 'drinks' }] }])

  await page.getByTestId('nav-stats').click()
  await expect(page.getByText('Всего потрачено')).toBeVisible()
  await expect(page.getByTestId('stats-category-label')).toHaveText(['Напитки', 'Молочные продукты'])
  await expect(page.getByTestId('stats-split-essential')).toContainText('Необходимое')
})

test('the receipt flow runs in Russian', async ({ page }) => {
  await useRussian(page)
  await page.route('**/api/extract-receipt', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ purchaseDate: null, items: [{ name: 'Молоко 3,2%', price: 1.19, category: 'dairy' }] }),
    }),
  )
  await page.goto('/')

  await page.getByTestId('receipt-capture-input').setInputFiles({ name: 'receipt.png', mimeType: 'image/png', buffer: SAMPLE_IMAGE })
  await expect(page.getByTestId('receipt-status')).toHaveText('Ожидает обработки')
  await expect(page.getByTestId('save-trip-unprocessed-hint')).toHaveText('Сначала обработайте или удалите фото чека')

  await page.getByTestId('receipt-process-button').click()
  await expect(page.getByTestId('receipt-status')).toHaveText('Обработан')
  await expect(page.getByTestId('receipt-review-title')).toHaveText('Вот что нашлось')
  await expect(page.getByTestId('receipt-review-confirm')).toHaveText('Подтвердить')
  expect(await englishLeftovers(page), 'review panel').toEqual([])
})

test('the login page follows the saved language', async ({ page }) => {
  await useRussian(page)
  await page.route('**/api/login', (route) =>
    route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'Incorrect password' }) }),
  )
  await page.goto('/login.html')

  await expect(page).toHaveTitle('Вход — Grocery Buddy')
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru')
  await expect(page.getByTestId('login-submit')).toHaveText('Войти')
  await expect(page.getByTestId('login-password')).toHaveAttribute('placeholder', 'Пароль')

  await page.getByTestId('login-password').fill('wrong')
  await page.getByTestId('login-submit').click()
  await expect(page.getByTestId('login-error')).toHaveText('Неверный пароль')
})

// ---- Currency: each trip keeps the currency it was recorded in ----

async function mockExtraction(page: Page, price = 1.19) {
  await page.route('**/api/extract-receipt', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ purchaseDate: null, items: [{ name: 'Молоко', price, category: 'dairy' }] }),
    }),
  )
}

/** Capture, process and confirm one receipt on the active trip. */
async function scanAndConfirm(page: Page) {
  const before = await page.getByTestId('receipt-item').count()
  await page.getByTestId('receipt-capture-input').setInputFiles({ name: 'receipt.png', mimeType: 'image/png', buffer: SAMPLE_IMAGE })
  await expect(page.getByTestId('receipt-item')).toHaveCount(before + 1)
  await page.getByTestId('receipt-process-button').click()
  await page.getByTestId('receipt-review-confirm').click()
  await expect(page.getByTestId('receipt-review-panel')).toHaveCount(0)
}

async function saveTrip(page: Page) {
  const tripId = await page.getByTestId('shopping-list').getAttribute('data-trip-id')
  await page.getByTestId('save-trip-button').click()
  await expect(page.getByTestId('shopping-list')).not.toHaveAttribute('data-trip-id', tripId ?? '')
}

/** Sets both language and currency on the Settings page (the two old combined regions). */
async function switchRegion(page: Page, id: 'en-EUR' | 'ru-BYN') {
  const [language, currency] = id === 'ru-BYN' ? ['ru', 'BYN'] : ['en', 'EUR']
  await page.getByTestId('nav-settings').click()
  await page.getByTestId('settings-language').selectOption(language)
  await page.getByTestId('settings-currency').selectOption(currency)
  await page.getByTestId('nav-shopping').click()
  await expect(page.getByTestId('shopping-list')).toBeVisible()
}

function tripCurrencies(page: Page): Promise<Record<string, string>> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('grocery-buddy')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const trips = await new Promise<{ id: number; currency: string }[]>((resolve, reject) => {
      const request = db.transaction('trips').objectStore('trips').getAll()
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    db.close()
    return Object.fromEntries(trips.map((trip) => [trip.id, trip.currency]))
  })
}

test('switching to Russian never relabels an EUR trip; trips recorded afterwards are in BYN', async ({ page }) => {
  await mockExtraction(page)
  await page.goto('/')
  await scanAndConfirm(page)
  await saveTrip(page) // an English/EUR trip

  await switchRegion(page, 'ru-BYN')
  // The fresh, still-empty draft follows the switch.
  await scanAndConfirm(page)
  await saveTrip(page)

  await page.getByTestId('nav-history').click()
  const rows = page.getByTestId('history-trip')
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(0)).toContainText('1 товар — 1,19 Br')
  await expect(rows.nth(1)).toContainText('1 товар — 1,19 €')

  // Back in English, the BYN trip is still BYN and the EUR trip still EUR.
  await switchRegion(page, 'en-EUR')
  await page.getByTestId('nav-history').click()
  await expect(rows.nth(0)).toContainText('1 item — 1,19 BYN')
  await expect(rows.nth(1)).toContainText('1 item — 1,19 €')
})

test('the draft follows a switch while it has no prices, but is locked once it holds a priced item', async ({ page }) => {
  await mockExtraction(page)
  await page.goto('/')
  await expect(page.getByTestId('shopping-list')).not.toHaveAttribute('data-trip-id', '')
  const draftId = await page.getByTestId('shopping-list').getAttribute('data-trip-id')

  // Typed items have no price — the draft still follows.
  await page.getByTestId('add-item-input').fill('Milk')
  await page.getByTestId('add-item-submit').click()
  await switchRegion(page, 'ru-BYN')
  await expect.poll(async () => (await tripCurrencies(page))[draftId!]).toBe('BYN')
  await switchRegion(page, 'en-EUR')
  await expect.poll(async () => (await tripCurrencies(page))[draftId!]).toBe('EUR')

  // A confirmed receipt adds priced items — now the currency is locked.
  await scanAndConfirm(page)
  await switchRegion(page, 'ru-BYN')
  await page.waitForTimeout(300)
  expect((await tripCurrencies(page))[draftId!]).toBe('EUR')

  await saveTrip(page)
  await page.getByTestId('nav-history').click()
  await expect(page.getByTestId('history-trip')).toContainText('1,19 €')
})

test('a month with trips in both currencies is totalled per currency in Stats, never summed across them', async ({ page }) => {
  await useRussian(page)
  await page.goto('/')
  await seedTrips(page, [
    { id: 101, date: '2026-08-05', currency: 'EUR', items: [milk(2), { name: 'Сок', price: 3, category: 'drinks' }] },
    { id: 102, date: '2026-08-20', currency: 'BYN', items: [milk(10)] },
  ])

  await page.getByTestId('nav-stats').click()
  await expect(page.getByTestId('stats-mixed-currencies')).toBeVisible()
  const blocks = page.getByTestId('stats-currency-block')
  await expect(blocks).toHaveCount(2)
  await expect(page.locator('[data-currency="BYN"]').getByTestId('stats-total')).toHaveText('10,00 Br')
  await expect(page.locator('[data-currency="EUR"]').getByTestId('stats-total')).toHaveText('5,00 €')
  await expect(page.locator('[data-currency="EUR"]').getByTestId('stats-category-label')).toHaveText(['Напитки', 'Молочные продукты'])
})

test('trips stored before currencies existed are upgraded to EUR', async ({ page }) => {
  // Build the database exactly as the previous app version left it
  // (schema version 4, no `currency` on trips), before the app opens it.
  await page.goto('/favicon.svg')
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('grocery-buddy', 40)
      request.onupgradeneeded = () => {
        const d = request.result
        const trips = d.createObjectStore('trips', { keyPath: 'id', autoIncrement: true })
        trips.createIndex('date', 'date')
        trips.createIndex('status', 'status')
        const items = d.createObjectStore('items', { keyPath: 'id', autoIncrement: true })
        items.createIndex('tripId', 'tripId')
        items.createIndex('category', 'category')
        const receipts = d.createObjectStore('pendingReceipts', { keyPath: 'id', autoIncrement: true })
        receipts.createIndex('tripId', 'tripId')
        receipts.createIndex('status', 'status')
        d.createObjectStore('appState', { keyPath: 'key' })
        d.createObjectStore('categoryNotes', { keyPath: 'id', autoIncrement: true }).createIndex('categoryKey', 'categoryKey')
        trips.put({ id: 7, date: '2026-08-05', total: 4.5, status: 'complete', createdAt: 1, completedAt: 1 })
        items.put({ id: 1, tripId: 7, name: 'Milch', price: 4.5, category: 'dairy', essentialOverride: null, source: 'ai', isDiscount: false, checked: false })
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    db.close()
  })

  await useRussian(page)
  await page.goto('/')
  await page.getByTestId('nav-history').click()
  await expect(page.getByTestId('history-trip')).toContainText('1 товар — 4,50 €')
  expect((await tripCurrencies(page))['7']).toBe('EUR')
})

test('backups keep each trip’s currency; older backups import as EUR; an unknown currency is rejected', async ({ page }) => {
  await useRussian(page)
  await page.goto('/')
  const backup = (schemaVersion: number, trip: Record<string, unknown>) =>
    JSON.stringify({
      schemaVersion,
      exportedAt: '2026-09-01T10:00:00.000Z',
      tables: {
        trips: [{ id: 50, date: '2026-08-05', total: 2, status: 'complete', createdAt: 1, completedAt: 1, ...trip }],
        items: [{ id: 50, tripId: 50, name: 'Молоко', price: 2, category: 'dairy', essentialOverride: null, source: 'ai', isDiscount: false, checked: false }],
        categoryNotes: [],
        pendingReceipts: [],
        appState: [],
      },
    })
  const importFile = async (content: string) => {
    await page.getByTestId('nav-history').click()
    await page.getByTestId('backup-import-input').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(content) })
  }

  await importFile(backup(3, { currency: 'USD' }))
  await expect(page.getByTestId('backup-import-error')).toContainText('У покупки №50 неизвестная валюта ("USD")')
  await importFile(backup(3, {}))
  await expect(page.getByTestId('backup-import-error')).toContainText('У покупки №50 не указана валюта')
  expect((await tripCurrencies(page))['50']).toBeUndefined()

  await importFile(backup(2, {})) // pre-currency backup
  await page.getByTestId('backup-import-confirm-yes').click()
  await expect(page.getByTestId('backup-import-success')).toBeVisible()
  expect((await tripCurrencies(page))['50']).toBe('EUR')
  await expect(page.getByTestId('history-trip')).toContainText('2,00 €')

  // Export carries the currency.
  const downloadPromise = page.waitForEvent('download')
  await page.getByTestId('backup-export-button').click()
  const path = await (await downloadPromise).path()
  const exported = JSON.parse(await readFile(path, 'utf-8'))
  expect(exported.schemaVersion).toBe(3)
  expect(exported.tables.trips.find((trip: { id: number }) => trip.id === 50).currency).toBe('EUR')
})

test('an unreadable receipt date is reported in Russian, quoting what the AI read', async ({ page }) => {
  await useRussian(page)
  await page.route('**/api/extract-receipt', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      // The server sends only the raw text; the sentence around it is the app's.
      body: JSON.stringify({ purchaseDate: null, purchaseDateRaw: '32.13.26', items: [{ name: 'Молоко', price: 1.19, category: 'dairy' }] }),
    }),
  )
  await page.goto('/')
  await page.getByTestId('receipt-capture-input').setInputFiles({ name: 'receipt.png', mimeType: 'image/png', buffer: SAMPLE_IMAGE })
  await page.getByTestId('receipt-process-button').click()

  await expect(page.getByTestId('receipt-review-date-error')).toHaveText(
    'Не удалось прочитать дату чека («32.13.26») — у покупки останется текущая дата, если не выбрать другую в «Показать товары».',
  )
})
