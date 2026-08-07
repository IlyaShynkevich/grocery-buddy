import { expect, test } from './fixtures'

test('About shows the app name, version, description, credit, and planned-updates note', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('nav-about').click()

  const about = page.getByTestId('about-page')
  await expect(about).toBeVisible()
  await expect(about).toContainText('Grocery Buddy')
  // Version text mirrors Footer's own v{package.json version} — just check
  // the "v" + digit shape rather than pinning an exact version number that
  // will drift with every release.
  await expect(page.getByTestId('about-version')).toHaveText(/^v\d+\.\d+\.\d+$/)
  await expect(page.getByTestId('about-description')).toContainText('shopping list')
  await expect(page.getByTestId('about-description')).toContainText('receipt')
  await expect(about).toContainText('Ilya Shynkevich')
  await expect(page.getByTestId('about-planned')).toContainText('trends over time')
})
