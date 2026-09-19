import { expect, test, type Page } from './fixtures'

// The Theme setting (Settings page): "Same as device" (default), Light, or
// Dark. Colours are checked on the page background (--bg on :root), so a
// theme that set data-theme but didn't actually recolour would still fail.
const LIGHT_BG = 'rgb(255, 255, 255)'
const DARK_BG = 'rgb(22, 23, 29)'

/** The app paints --bg on <html>; login.html paints it on <body>. */
function background(page: Page, selector: 'html' | 'body' = 'html'): Promise<string> {
  return page.locator(selector).evaluate((el) => getComputedStyle(el).backgroundColor)
}

/** Which theme-color meta the browser would use: [light meta's media, dark meta's media]. */
function themeColorMedia(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    ['light', 'dark'].map((t) => document.querySelector<HTMLMetaElement>(`meta[name="theme-color"][data-theme-color="${t}"]`)!.media),
  )
}

async function pickTheme(page: Page, theme: 'system' | 'light' | 'dark') {
  await page.getByTestId('nav-settings').click()
  await page.getByTestId('settings-theme').selectOption(theme)
}

test('"Same as device" is the default and follows the device switching live', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/')
  await page.getByTestId('nav-settings').click()
  await expect(page.getByTestId('settings-theme')).toHaveValue('system')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  expect(await background(page)).toBe(DARK_BG)
  expect(await themeColorMedia(page)).toEqual(['(prefers-color-scheme: light)', '(prefers-color-scheme: dark)'])

  await page.emulateMedia({ colorScheme: 'light' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  expect(await background(page)).toBe(LIGHT_BG)
})

test.describe(() => {
  // The pre-paint check blocks the app's bundle with page.route(), which
  // never sees requests a service worker answers from its cache.
  test.use({ serviceWorkers: 'block' })

  for (const { theme, device, bg, media } of [
    { theme: 'light', device: 'dark', bg: LIGHT_BG, media: ['all', 'not all'] },
    { theme: 'dark', device: 'light', bg: DARK_BG, media: ['not all', 'all'] },
  ] as const) {
    test(`"${theme}" overrides a ${device} device, survives a reload, and applies before the app loads`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: device })
      await page.goto('/')
      await pickTheme(page, theme)

      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
      expect(await background(page)).toBe(bg)
      expect(await page.evaluate(() => document.documentElement.style.colorScheme)).toBe(theme)
      expect(await themeColorMedia(page)).toEqual(media)
      // A forced theme ignores the device switching.
      await page.emulateMedia({ colorScheme: theme })
      await page.emulateMedia({ colorScheme: device })
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)

      // With the app's own script blocked, only index.html's inline pre-paint
      // script can have applied it — proving there's no wrong-theme flash.
      await page.route(/\/assets\/index-.*\.js$/, (route) => route.abort())
      await page.reload()
      expect(await page.locator('#root').innerHTML()).toBe('')
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
      expect(await background(page)).toBe(bg)
      expect(await themeColorMedia(page)).toEqual(media)
    })
  }
})

test('going back to "Same as device" follows the device again', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/')
  await pickTheme(page, 'light')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

  await page.getByTestId('settings-theme').selectOption('system')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  expect(await background(page)).toBe(DARK_BG)
  await page.reload()
  await expect(page.getByTestId('settings-theme')).toHaveValue('system')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})

test('the login page follows the saved theme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/')
  await pickTheme(page, 'dark')

  await page.goto('/login.html')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  expect(await background(page, 'body')).toBe(DARK_BG)

  await page.evaluate(() => localStorage.setItem('grocery-buddy:theme', 'system'))
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  expect(await background(page, 'body')).toBe(LIGHT_BG)
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})

test('an unreadable saved theme is reported and falls back to the device theme', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  await page.addInitScript(() => localStorage.setItem('grocery-buddy:theme', 'purple'))
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/')

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.getByTestId('nav-settings').click()
  await expect(page.getByTestId('settings-theme')).toHaveValue('system')
  expect(errors.some((e) => e.includes('unknown saved theme "purple"'))).toBe(true)
})

test('theme options are translated', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('nav-settings').click()
  await page.getByTestId('settings-language').selectOption('ru')
  await expect(page.getByTestId('settings-page')).toContainText('Тема')
  await expect(page.getByTestId('settings-theme').locator('option')).toHaveText(['Как на устройстве', 'Светлая', 'Тёмная'])
})
