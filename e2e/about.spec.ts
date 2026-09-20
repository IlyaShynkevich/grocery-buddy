import packageJson from '../package.json' with { type: 'json' }
import { expect, test } from './fixtures'

test('About shows the app name, version, description, credit, and planned-updates note', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('nav-about').click()

  const about = page.getByTestId('about-page')
  await expect(about).toBeVisible()
  await expect(about).toContainText('Grocery Buddy')
  // Read from package.json rather than hardcoded, so this doesn't have to
  // be edited on every release — but it is still the real number, so a
  // release that bumps package.json and forgets one of the two places the
  // version is shown fails here rather than shipping a stale version.
  await expect(page.getByTestId('about-version')).toHaveText(`v${packageJson.version}`)
  await expect(page.getByTestId('about-description')).toContainText('shopping list')
  await expect(page.getByTestId('about-description')).toContainText('receipt')
  await expect(about).toContainText('Ilya Shynkevich')
  await expect(page.getByTestId('about-planned')).toContainText('trends over time')
})

test('the footer shows the same version as About, from package.json', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('app-footer-version')).toHaveText(`v${packageJson.version}`)

  // The footer is on every page, so it is the one that would go stale
  // unnoticed; check it against About on About's own page too.
  await page.getByTestId('nav-about').click()
  await expect(page.getByTestId('about-page')).toBeVisible()
  await expect(page.getByTestId('app-footer-version')).toHaveText(`v${packageJson.version}`)
  await expect(page.getByTestId('about-version')).toHaveText(`v${packageJson.version}`)
})
