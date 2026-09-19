import { expect, test, type Page } from './fixtures'

// Language and currency used to be one combined setting
// ('grocery-buddy:region' = 'en-EUR' | 'ru-BYN'); they're now independent
// keys. A device that saved the old value must keep its language and
// currency after updating.

const readKeys = (page: Page) =>
  page.evaluate(() => ({
    language: localStorage.getItem('grocery-buddy:language'),
    currency: localStorage.getItem('grocery-buddy:currency'),
    legacy: localStorage.getItem('grocery-buddy:region'),
  }))

/** Seeds the old key once — only on the very first page load of the test. */
async function seedLegacy(page: Page, value: string) {
  await page.addInitScript((v) => {
    if (sessionStorage.getItem('test:legacySeeded')) return
    sessionStorage.setItem('test:legacySeeded', '1')
    localStorage.setItem('grocery-buddy:region', v)
  }, value)
}

test("an old 'ru-BYN' setting becomes Russian + BYN, and the old key is removed", async ({ page }) => {
  await seedLegacy(page, 'ru-BYN')
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Список покупок' })).toBeVisible()
  expect(await readKeys(page)).toEqual({ language: 'ru', currency: 'BYN', legacy: null })

  // New trips are recorded in BYN, as before the update. (Wait for the
  // draft to exist first — it's created asynchronously after first render.)
  await expect(page.getByTestId('shopping-list')).not.toHaveAttribute('data-trip-id', '')
  const draftCurrency = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('grocery-buddy')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const pointer = await new Promise<{ value: number }>((resolve, reject) => {
      const request = db.transaction('appState').objectStore('appState').get('activeTripId')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const trip = await new Promise<{ currency: string }>((resolve, reject) => {
      const request = db.transaction('trips').objectStore('trips').get(pointer.value)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    db.close()
    return trip.currency
  })
  expect(draftCurrency).toBe('BYN')

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Список покупок' })).toBeVisible()
})

test("an old 'en-EUR' setting becomes English + EUR", async ({ page }) => {
  await seedLegacy(page, 'en-EUR')
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Shopping List' })).toBeVisible()
  expect(await readKeys(page)).toEqual({ language: 'en', currency: 'EUR', legacy: null })
})

test('an unrecognised old setting is reported and falls back to the defaults', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()))
  await seedLegacy(page, 'de-CHF')
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Shopping List' })).toBeVisible()
  expect(errors.some((e) => e.includes('unknown saved region "de-CHF"'))).toBe(true)
  expect(await readKeys(page)).toEqual({ language: 'en', currency: 'EUR', legacy: null })
})

test('if the migration cannot be saved, it still applies for the session and the old key stays for a retry', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()))
  await seedLegacy(page, 'ru-BYN')
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (this: Storage, key: string, value: string) {
      if (key === 'grocery-buddy:currency') throw new DOMException('Simulated quota error', 'QuotaExceededError')
      return original.call(this, key, value)
    }
  })
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Список покупок' })).toBeVisible()
  expect(errors.some((e) => e.includes('could not migrate the old region setting'))).toBe(true)
  expect((await readKeys(page)).legacy).toBe('ru-BYN')
})

test('the login page follows the new language key, and falls back to the old one', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('grocery-buddy:language', 'ru'))
  await page.goto('/login.html')
  await expect(page.getByTestId('login-submit')).toHaveText('Войти')

  const fresh = await page.context().browser()!.newContext()
  const legacyOnly = await fresh.newPage()
  await legacyOnly.addInitScript(() => localStorage.setItem('grocery-buddy:region', 'ru-BYN'))
  await legacyOnly.goto(new URL('/login.html', page.url()).href)
  await expect(legacyOnly.getByTestId('login-submit')).toHaveText('Войти')
  await fresh.close()
})
