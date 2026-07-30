import { expect, test } from '@playwright/test'

test('DB Debug Panel is collapsed by default and can be opened/closed via its toggle', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByTestId('debug-panel-toggle')).toBeVisible()
  // Collapsed: contents exist (native <details>) but aren't rendered visible.
  await expect(page.getByTestId('debug-create-trip')).not.toBeVisible()

  await page.getByTestId('debug-panel-toggle').click()
  await expect(page.getByTestId('debug-create-trip')).toBeVisible()

  await page.getByTestId('debug-panel-toggle').click()
  await expect(page.getByTestId('debug-create-trip')).not.toBeVisible()
})
