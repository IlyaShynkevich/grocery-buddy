import { expect, test, type Page } from './fixtures'

// Debug tools is off by default (the fixture's debugTools option is false
// here) and only toggled by three quick taps on the Home page mascot.

async function goHome(page: Page) {
  await page.getByTestId('nav-home').click()
  await expect(page.getByTestId('home-mascot')).toBeVisible()
}

async function tapMascot(page: Page, times: number) {
  for (let i = 0; i < times; i++) await page.getByTestId('home-mascot').click()
}

async function goShopping(page: Page) {
  await page.getByTestId('nav-shopping').click()
  await expect(page.getByTestId('shopping-list')).toBeVisible()
}

test('Debug tools is absent by default, with nothing on screen hinting at it', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('shopping-list')).toBeVisible()
  await expect(page.getByTestId('debug-panel')).toHaveCount(0)
  await expect(page.getByText('Debug tools')).toHaveCount(0)

  // The mascot is not presented as interactive.
  await goHome(page)
  const mascot = page.getByTestId('home-mascot')
  expect(await mascot.getAttribute('role')).toBeNull()
  expect(await mascot.evaluate((el) => getComputedStyle(el).cursor)).not.toBe('pointer')
})

test('three taps on the Home mascot toggle Debug tools on and off, with a toast each time', async ({ page }) => {
  await page.goto('/')
  await goHome(page)

  await tapMascot(page, 3)
  const toast = page.getByTestId('toast')
  await expect(toast).toHaveText('Debug tools enabled')
  await expect(toast).toHaveAttribute('role', 'status')

  await goShopping(page)
  await expect(page.getByTestId('debug-panel')).toBeVisible()

  // Everything is still in the panel — the trip date editor in particular.
  await page.getByTestId('debug-panel-toggle').click()
  await expect(page.getByTestId('debug-trip-date-input').first()).toBeVisible()

  // Remembered for the session: survives a reload.
  await page.reload()
  await expect(page.getByTestId('debug-panel')).toBeVisible()

  await goHome(page)
  await tapMascot(page, 3)
  await expect(page.getByTestId('toast')).toHaveText('Debug tools hidden')
  await goShopping(page)
  await expect(page.getByTestId('debug-panel')).toHaveCount(0)

  await page.reload()
  await expect(page.getByTestId('shopping-list')).toBeVisible()
  await expect(page.getByTestId('debug-panel')).toHaveCount(0)
})

test('the toast fades away on its own', async ({ page }) => {
  await page.goto('/')
  await goHome(page)
  await tapMascot(page, 3)
  await expect(page.getByTestId('toast')).toBeVisible()
  await expect(page.getByTestId('toast')).toHaveCount(0, { timeout: 5000 })
})

test('two taps, or three taps too far apart, do nothing', async ({ page }) => {
  await page.goto('/')
  await goHome(page)

  await tapMascot(page, 2)
  await page.waitForTimeout(1700) // longer than the 1.5s gap allowed between taps
  await tapMascot(page, 1)
  await page.waitForTimeout(1700)
  await tapMascot(page, 1)

  await expect(page.getByTestId('toast')).toHaveCount(0)
  await goShopping(page)
  await expect(page.getByTestId('debug-panel')).toHaveCount(0)
})

test('the toast is translated in Russian', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('grocery-buddy:region', 'ru-BYN'))
  await page.goto('/')
  await goHome(page)

  await tapMascot(page, 3)
  await expect(page.getByTestId('toast')).toHaveText('Инструменты отладки включены')
  await tapMascot(page, 3)
  await expect(page.getByTestId('toast')).toHaveText('Инструменты отладки скрыты')
})
