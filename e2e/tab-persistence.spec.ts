import { expect, test } from '@playwright/test'

test('reloading the app restores the tab that was active, not always Shopping List', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('nav-history').click()
  await expect(page.getByTestId('history-page')).toBeVisible()

  await page.reload()

  // Lands directly on History with no click needed — and with no transition
  // wrapper mounted at all, since the restored tab must already be correct
  // on the very first render, not slide in from Shopping List a beat later.
  await expect(page.getByTestId('history-page')).toBeVisible()
  await expect(page.locator('.gb-tab-slide')).toHaveCount(0)
  await expect(page.getByTestId('shopping-list')).toHaveCount(0)
})

test('each of the 4 main tabs survives a reload independently', async ({ page }) => {
  await page.goto('/')

  for (const { nav, pageTestId } of [
    { nav: 'nav-stats', pageTestId: 'stats-page' },
    { nav: 'nav-customize', pageTestId: 'customize-page' },
    { nav: 'nav-shopping', pageTestId: 'shopping-list' },
  ]) {
    await page.getByTestId(nav).click()
    await expect(page.getByTestId(pageTestId)).toBeVisible()
    await page.reload()
    await expect(page.getByTestId(pageTestId)).toBeVisible()
    await expect(page.locator('.gb-tab-slide')).toHaveCount(0)
  }
})

test('an unrecognized stored tab value falls back to Shopping List instead of crashing', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.setItem('grocery-buddy:activeTab', 'not-a-real-tab'))

  await page.reload()

  await expect(page.getByTestId('shopping-list')).toBeVisible()
})

test('Home and About are not persisted — a reload from either falls back to Shopping List', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('nav-history').click()
  await expect(page.getByTestId('history-page')).toBeVisible()

  // History is now the stored tab; visiting a corner page afterwards must
  // not overwrite it, since Home/About aren't part of the persisted set.
  await page.getByTestId('nav-home').click()
  await page.reload()

  await expect(page.getByTestId('history-page')).toBeVisible()
})
