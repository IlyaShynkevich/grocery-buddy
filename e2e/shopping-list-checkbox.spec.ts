import { expect, test } from './fixtures'

test('checking a shopping list item marks it grabbed, unchecking reverts it', async ({ page }) => {
  await page.goto('/')

  await page.getByTestId('add-item-input').fill('Milk')
  await page.getByTestId('add-item-submit').click()

  const checkbox = page.getByTestId('shopping-list-item-checkbox')
  const nameInput = page.getByLabel('Edit Milk')

  await expect(checkbox).not.toBeChecked()
  await expect(nameInput).not.toHaveCSS('text-decoration-line', 'line-through')

  await checkbox.click()
  await expect(checkbox).toBeChecked()
  await expect(nameInput).toHaveCSS('text-decoration-line', 'line-through')

  await checkbox.click()
  await expect(checkbox).not.toBeChecked()
  await expect(nameInput).not.toHaveCSS('text-decoration-line', 'line-through')
})

test('checked state persists across a page reload for the same trip', async ({ page }) => {
  await page.goto('/')

  await page.getByTestId('add-item-input').fill('Eggs')
  await page.getByTestId('add-item-submit').click()

  const checkbox = page.getByTestId('shopping-list-item-checkbox')
  await checkbox.click()
  await expect(checkbox).toBeChecked()

  await page.reload()

  await expect(page.getByTestId('shopping-list-item-checkbox')).toBeChecked()
  await expect(page.getByLabel('Edit Eggs')).toHaveCSS('text-decoration-line', 'line-through')
})
