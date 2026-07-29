import { expect, test } from '@playwright/test'

async function addItem(page: import('@playwright/test').Page, name: string) {
  await page.getByTestId('add-item-input').fill(name)
  await page.getByTestId('add-item-submit').click()
  // Wait for it to actually land before returning, so firing adds back-to-back
  // in a test can't race a later submit against an earlier one's React re-render.
  await expect(page.getByTestId('shopping-list-item').last().locator('input[type="text"]')).toHaveValue(name)
}

async function itemNames(page: import('@playwright/test').Page): Promise<string[]> {
  const inputs = await page.getByTestId('shopping-list-item').locator('input[type="text"]').all()
  return Promise.all(inputs.map((input) => input.inputValue()))
}

test('debug-panel trip creation does not steal the active trip, even across reload', async ({ page }) => {
  await page.goto('/')

  await addItem(page, 'Milk')
  await addItem(page, 'Eggs')
  await addItem(page, 'Cucumber')
  await expect.poll(() => itemNames(page)).toEqual(['Milk', 'Eggs', 'Cucumber'])

  const shoppingListTripId = await page.getByTestId('shopping-list').getAttribute('data-trip-id')

  await page.getByTestId('debug-create-trip').click()
  // creating a trip in the debug panel must not change what the shopping list shows
  await expect.poll(() => itemNames(page)).toEqual(['Milk', 'Eggs', 'Cucumber'])

  await page.reload()

  // this is the exact regression: reload must not hand "active" to the new empty trip
  await expect.poll(() => itemNames(page)).toEqual(['Milk', 'Eggs', 'Cucumber'])

  const activeTripDiv = page.locator('[data-testid="debug-trip"][data-active="true"]')
  await expect(activeTripDiv).toHaveCount(1)
  await expect(activeTripDiv).toHaveAttribute('data-trip-id', shoppingListTripId ?? '')
})

test('root cause: reset-then-create-trip-then-reload does not orphan the active pointer', async ({ page }) => {
  await page.goto('/')

  // start clean, exactly like the user's "fresh database" starting point
  await page.getByTestId('debug-reset-all').click()

  await addItem(page, 'Milk')
  await addItem(page, 'Eggs')
  await addItem(page, 'Cucumber')
  await expect.poll(() => itemNames(page)).toEqual(['Milk', 'Eggs', 'Cucumber'])

  const shoppingListTripId = await page.getByTestId('shopping-list').getAttribute('data-trip-id')

  await page.getByTestId('debug-create-trip').click()
  await page.reload()

  await expect.poll(() => itemNames(page)).toEqual(['Milk', 'Eggs', 'Cucumber'])

  const activeTripDiv = page.locator('[data-testid="debug-trip"][data-active="true"]')
  await expect(activeTripDiv).toHaveCount(1)
  await expect(activeTripDiv).toHaveAttribute('data-trip-id', shoppingListTripId ?? '')
})
