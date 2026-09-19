import { expect, test, type Page } from './fixtures'

// The rest of the suite runs in the default English region; this spec
// covers the Russian/BYN region end to end.

const REGION_KEY = 'grocery-buddy:region'

// 1x1 PNG, same fixture as the other receipt specs.
const SAMPLE_IMAGE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

/** Starts the page already in Russian — the setting as a returning user would have it saved. */
async function useRussian(page: Page) {
  await page.addInitScript((key) => localStorage.setItem(key, 'ru-BYN'), REGION_KEY)
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
          ...(trip.currency ? { currency: trip.currency } : {}),
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
  await page.getByTestId('nav-customize').click()
  await expect(page.getByRole('heading', { name: 'Customize' })).toBeVisible()

  await page.getByTestId('region-select').selectOption('ru-BYN')

  await expect(page.getByRole('heading', { name: 'Настройки' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru')
  await expect(page.getByTestId('nav-history')).toHaveAttribute('aria-label', 'История')
  await expect(page.getByTestId('category-accordion-toggle').first()).toHaveText('Овощи и фрукты')
  expect(await page.evaluate((key) => localStorage.getItem(key), REGION_KEY)).toBe('ru-BYN')

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Настройки' })).toBeVisible()
  await expect(page.getByTestId('region-select')).toHaveValue('ru-BYN')

  await page.getByTestId('region-select').selectOption('en-EUR')
  await expect(page.getByRole('heading', { name: 'Customize' })).toBeVisible()
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
    ['nav-customize', 'Настройки'],
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
