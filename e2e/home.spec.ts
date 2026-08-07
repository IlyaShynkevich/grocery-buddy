import { expect, test } from '@playwright/test'

// Deliberately importing `test`/`expect` straight from @playwright/test, not
// ./fixtures — every other spec's fixture pre-seeds the "already past Home
// this session" sessionStorage flag so existing tests can assume
// page.goto('/') lands directly on Shopping List. This file is the one place
// that needs the real, unseeded fresh-launch path.

test('a genuinely fresh app open shows Home, with the mascot and a CTA to Shopping List', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByTestId('home-page')).toBeVisible()
  await expect(page.getByTestId('home-page')).toContainText('Grocery Buddy')
  await expect(page.getByTestId('mascot')).toHaveAttribute('data-pose', 'idle')
  await expect(page.getByTestId('shopping-list')).toHaveCount(0)

  await page.getByTestId('home-shop-button').click()
  await expect(page.getByTestId('shopping-list')).toBeVisible()
  await expect(page.getByTestId('home-page')).toHaveCount(0)
})

test('a fresh app open shows Home even if a previous session left a different tab persisted', async ({ page }) => {
  await page.goto('/')
  // Simulate "closed the app while on History in an earlier session" —
  // localStorage (not sessionStorage) is what that leaves behind.
  await page.evaluate(() => localStorage.setItem('grocery-buddy:activeTab', 'history'))

  await page.reload()

  // sessionStorage was cleared by the reload's fresh navigation context in
  // this test (no fixture pre-seeding it), so this still counts as a fresh
  // session — Home wins over the persisted tab.
  await expect(page.getByTestId('home-page')).toBeVisible()
})

test('tapping a nav tab directly from Home (not the CTA) also counts as leaving Home for this session', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.getByTestId('home-page')).toBeVisible()

  await page.getByTestId('nav-stats').click()
  await expect(page.getByTestId('stats-page')).toBeVisible()

  await page.reload()
  await expect(page.getByTestId('stats-page')).toBeVisible()
  await expect(page.getByTestId('home-page')).toHaveCount(0)
})

test('tapping About from Home does not count as leaving Home for this session', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('nav-about').click()
  await expect(page.getByTestId('about-page')).toBeVisible()

  await page.reload()

  // About isn't one of the 4 main tabs — visiting it doesn't mark the
  // session as "past Home," so a reload still starts fresh on Home.
  await expect(page.getByTestId('home-page')).toBeVisible()
})
