import { expect, openCustomize, test, type Page } from './fixtures'

// These pages are tuned to fit one phone screen without scrolling — the
// usable viewport of the target phone (Xiaomi 14T Pro, browser chrome
// excluded) — in both languages, since Russian text runs ~15–25% longer.
// Worst-case content: all 11 categories in Stats, 12 trips over 2 months in
// History (enough to hit the list's internal scroll and the month filter),
// and Settings with its storage figures loaded.
test.use({ viewport: { width: 393, height: 777 }, isMobile: true, hasTouch: true })

const CATEGORIES = ['produce', 'dairy', 'meat_seafood', 'bakery', 'frozen', 'pantry', 'household', 'personal_care', 'snacks', 'drinks', 'other']

async function seedWorstCase(page: Page) {
  await page.evaluate(async (categories) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('grocery-buddy')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['trips', 'items'], 'readwrite')
      let itemId = 5000
      for (let trip = 1; trip <= 12; trip++) {
        const date = `2026-0${trip % 2 === 0 ? 8 : 7}-${String(10 + trip).padStart(2, '0')}`
        let total = 0
        for (const category of categories) {
          total += 2
          tx.objectStore('items').put({ id: itemId++, tripId: 100 + trip, name: 'x', price: 2, category, essentialOverride: null, source: 'ai', isDiscount: false, checked: false })
        }
        tx.objectStore('trips').put({ id: 100 + trip, date, total, currency: 'EUR', status: 'complete', createdAt: trip, completedAt: trip })
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  }, CATEGORIES)
  await page.reload()
}

const pageOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)

/** Labels whose text is wider than the box they're laid out in. */
const overflowingLabels = (page: Page, selector: string) =>
  page.locator(selector).evaluateAll((els) => els.filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.textContent))

for (const region of ['en-EUR', 'ru-BYN'] as const) {
  test(`${region}: About, Stats, History, Settings and Customize each fit one screen`, async ({ page }) => {
    await page.addInitScript((id) => {
      const [language, currency] = id === 'ru-BYN' ? ['ru', 'BYN'] : ['en', 'EUR']
      localStorage.setItem('grocery-buddy:language', language)
      localStorage.setItem('grocery-buddy:currency', currency)
    }, region)
    await page.goto('/')
    await seedWorstCase(page)

    for (const [tab, ready] of [
      ['nav-about', 'about-page'],
      ['nav-stats', 'stats-category-chart'],
      ['nav-history', 'history-month-select'],
      ['nav-settings', 'storage-total'],
    ] as const) {
      await page.getByTestId(tab).click()
      await expect(page.getByTestId(ready)).toBeVisible()
      await page.waitForTimeout(400) // tab slide animation
      expect(await pageOverflow(page), `${tab} overflows the screen`).toBeLessThanOrEqual(0)

      if (tab === 'nav-stats') {
        await expect(page.getByTestId('stats-category-bar')).toHaveCount(11)
        expect(
          await overflowingLabels(page, '[data-testid="stats-category-label"], [data-testid^="stats-split-"] > span:first-child'),
          'Stats labels wider than their column',
        ).toEqual([])
      }

      if (tab === 'nav-settings') {
        // Every setting/storage label and button stays on one line, and
        // nothing pushes the page sideways.
        expect(
          await page.evaluate(() =>
            Array.from(
              document.querySelectorAll(
                '[data-testid="settings-page"] label > span, [data-testid="settings-open-customize"], [data-testid="backup-section"] button, [data-testid^="storage-"] > span',
              ),
            )
              .filter((el) => el.getBoundingClientRect().height > parseFloat(getComputedStyle(el).fontSize) * 1.9 + parseFloat(getComputedStyle(el).paddingTop) + parseFloat(getComputedStyle(el).paddingBottom) + 2)
              .map((el) => el.textContent),
          ),
          'Settings labels wrapping onto two lines',
        ).toEqual([])
        expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 'Settings overflows sideways').toBeLessThanOrEqual(0)
      }
    }

    // Customize now opens from Settings; it must still fit all 11 cards.
    await openCustomize(page)
    await expect(page.getByTestId('category-accordion')).toHaveCount(11)
    expect(await pageOverflow(page), 'Customize overflows the screen').toBeLessThanOrEqual(0)
  })
}

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')

for (const [region, saveLabel] of [
  ['en-EUR', 'Save trip'],
  ['ru-BYN', 'Сохранить покупку'],
] as const) {
  test(`${region}: the Shopping List (3 items + a pending receipt) fits, with "${saveLabel}" and the title each on one line`, async ({ page }) => {
    await page.addInitScript((id) => {
      const [language, currency] = id === 'ru-BYN' ? ['ru', 'BYN'] : ['en', 'EUR']
      localStorage.setItem('grocery-buddy:language', language)
      localStorage.setItem('grocery-buddy:currency', currency)
    }, region)
    await page.goto('/')
    // Measured capacity at 393x777, identical in both languages: 4 items fit
    // with no receipt, 3 with a pending receipt (its hint under Save trip).
    // Beyond that the list scrolls by design — it's unbounded. This is the
    // tightest fitting case, and it must hold in both languages.
    for (const name of ['Milk', 'Bread', 'Eggs']) {
      const before = await page.getByTestId('shopping-list-item').count()
      await page.getByTestId('add-item-input').fill(name)
      await page.getByTestId('add-item-submit').click()
      await expect(page.getByTestId('shopping-list-item')).toHaveCount(before + 1)
    }
    // A pending receipt adds the "process it first" hint under Save trip —
    // the case that used to squeeze the Russian title onto two lines.
    await page.getByTestId('receipt-capture-input').setInputFiles({ name: 'r.png', mimeType: 'image/png', buffer: PNG })
    await expect(page.getByTestId('save-trip-unprocessed-hint')).toBeVisible()

    const saveTrip = page.getByTestId('save-trip-button')
    await expect(saveTrip).toHaveText(saveLabel)
    await expect(page.getByTestId('debug-panel')).toHaveCount(0)

    const layout = await page.evaluate(() => {
      const oneLine = (el: Element) => {
        const style = getComputedStyle(el)
        return el.getBoundingClientRect().height < parseFloat(style.fontSize) * 1.9 + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + 2
      }
      const title = document.querySelector('[data-testid="shopping-list"] h1')!
      const button = document.querySelector('[data-testid="save-trip-button"]')!
      return {
        titleOneLine: oneLine(title),
        buttonOneLine: oneLine(button) && button.scrollWidth <= button.clientWidth + 1,
        pageOverflow: document.documentElement.scrollHeight - innerHeight,
        horizontalOverflow: document.documentElement.scrollWidth - innerWidth,
      }
    })
    expect(layout).toEqual({ titleOneLine: true, buttonOneLine: true, pageOverflow: 0, horizontalOverflow: 0 })
  })
}
