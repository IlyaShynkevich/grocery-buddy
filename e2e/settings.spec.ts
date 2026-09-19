import { expect, openCustomize, test, type Page } from './fixtures'

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')

async function goToSettings(page: Page) {
  await page.getByTestId('nav-settings').click()
  await expect(page.getByTestId('settings-page')).toBeVisible()
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

async function scanConfirmAndSave(page: Page) {
  const tripId = await page.getByTestId('shopping-list').getAttribute('data-trip-id')
  await page.getByTestId('receipt-capture-input').setInputFiles({ name: 'r.png', mimeType: 'image/png', buffer: PNG })
  await page.getByTestId('receipt-process-button').click()
  await page.getByTestId('receipt-review-confirm').click()
  await expect(page.getByTestId('receipt-review-panel')).toHaveCount(0)
  await page.getByTestId('save-trip-button').click()
  await expect(page.getByTestId('shopping-list')).not.toHaveAttribute('data-trip-id', tripId ?? '')
}

test('the nav bar has 6 icons — Home, Shopping, History, Stats, Settings, About — and no Customize', async ({ page }) => {
  await page.goto('/')
  const buttons = page.getByTestId('app-nav').getByRole('button')
  await expect(buttons).toHaveCount(6)
  expect(await buttons.evaluateAll((els) => els.map((el) => el.getAttribute('data-testid')))).toEqual([
    'nav-home',
    'nav-shopping',
    'nav-history',
    'nav-stats',
    'nav-settings',
    'nav-about',
  ])
  await expect(page.getByTestId('nav-settings')).toHaveAttribute('aria-label', 'Settings')
  await expect(page.getByTestId('nav-customize')).toHaveCount(0)
})

test('Customize is reached from Settings, keeps Settings highlighted, and its back button returns', async ({ page }) => {
  await page.goto('/')
  await goToSettings(page)
  await expect(page.getByTestId('nav-settings')).toHaveAttribute('aria-current', 'page')

  await page.getByTestId('settings-open-customize').click()
  await expect(page.getByTestId('customize-page')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Customize' })).toBeVisible()
  await expect(page.getByTestId('nav-settings')).toHaveAttribute('aria-current', 'page')
  await expect(page.locator('[aria-current="page"]')).toHaveCount(1)

  await page.getByTestId('customize-back').click()
  await expect(page.getByTestId('settings-page')).toBeVisible()
})

test('a saved "customize" tab from before Settings existed now opens Settings', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('grocery-buddy:activeTab', 'customize'))
  await page.goto('/')
  await expect(page.getByTestId('settings-page')).toBeVisible()
})

test('language and currency change independently of each other', async ({ page }) => {
  await page.goto('/')
  await goToSettings(page)

  await page.getByTestId('settings-currency').selectOption('BYN')
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible() // language untouched
  await expect(page.getByTestId('settings-language')).toHaveValue('en')

  await page.getByTestId('settings-language').selectOption('ru')
  await expect(page.getByRole('heading', { name: 'Настройки' })).toBeVisible()
  await expect(page.getByTestId('settings-currency')).toHaveValue('BYN') // currency untouched

  await page.getByTestId('settings-currency').selectOption('EUR')
  await expect(page.getByTestId('settings-language')).toHaveValue('ru')

  await page.reload()
  await expect(page.getByTestId('settings-language')).toHaveValue('ru')
  await expect(page.getByTestId('settings-currency')).toHaveValue('EUR')
  expect(
    await page.evaluate(() => [localStorage.getItem('grocery-buddy:language'), localStorage.getItem('grocery-buddy:currency')]),
  ).toEqual(['ru', 'EUR'])
})

test('the currency setting never relabels existing trips — only new trips use it', async ({ page }) => {
  await page.route('**/api/extract-receipt', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ purchaseDate: null, items: [{ name: 'Milk', price: 2.5, category: 'dairy' }] }),
    }),
  )
  await page.goto('/')
  await expect(page.getByTestId('shopping-list')).not.toHaveAttribute('data-trip-id', '')
  await scanConfirmAndSave(page) // a EUR trip

  // Currency only — the language stays English.
  await goToSettings(page)
  await page.getByTestId('settings-currency').selectOption('BYN')
  await page.getByTestId('nav-shopping').click()
  await scanConfirmAndSave(page) // recorded in BYN

  await page.getByTestId('nav-history').click()
  const rows = page.getByTestId('history-trip')
  await expect(rows.nth(0)).toContainText('1 item — 2,50 BYN')
  await expect(rows.nth(1)).toContainText('1 item — 2,50 €')

  // Switching back doesn't relabel the BYN trip either.
  await goToSettings(page)
  await page.getByTestId('settings-currency').selectOption('EUR')
  await page.getByTestId('nav-history').click()
  await expect(rows.nth(0)).toContainText('2,50 BYN')
  await expect(rows.nth(1)).toContainText('2,50 €')

  // Changing the language touches no trip's currency at all.
  const before = await tripCurrencies(page)
  await goToSettings(page)
  await page.getByTestId('settings-language').selectOption('ru')
  await page.waitForTimeout(300)
  expect(await tripCurrencies(page)).toEqual(before)
})

test('Settings has no English left over in Russian, and Customize is titled "Мои категории"', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('grocery-buddy:language', 'ru'))
  await page.goto('/')
  await goToSettings(page)
  await expect(page.getByRole('heading', { name: 'Настройки', level: 1 })).toBeVisible()
  await expect(page.getByTestId('settings-currency-hint')).toHaveText('Для новых покупок — у сохранённых остаётся своя валюта.')
  await expect(page.getByTestId('settings-open-customize')).toContainText('Мои категории')
  await openCustomize(page)
  await expect(page.getByRole('heading', { name: 'Мои категории', level: 1 })).toBeVisible()
  await expect(page.getByTestId('customize-back')).toHaveAttribute('aria-label', 'Назад к настройкам')
})
