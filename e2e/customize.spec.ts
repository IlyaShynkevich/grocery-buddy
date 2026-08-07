import { expect, test, type Page } from './fixtures'

function categoryAccordion(page: Page, key: string) {
  return page.locator(`[data-testid="category-accordion"][data-category-key="${key}"]`)
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('nav-customize').click()
  await expect(page.getByTestId('customize-page')).toBeVisible()
})

test('a category starts collapsed, and tapping its header expands/collapses it', async ({ page }) => {
  const frozen = categoryAccordion(page, 'frozen')
  await expect(frozen.getByTestId('category-note-input')).not.toBeVisible()

  await frozen.locator('summary').click()
  await expect(frozen.getByTestId('category-note-input')).toBeVisible()

  await frozen.locator('summary').click()
  await expect(frozen.getByTestId('category-note-input')).not.toBeVisible()
})

test('a category with no notes shows the empty state', async ({ page }) => {
  const produce = categoryAccordion(page, 'produce')
  await produce.locator('summary').click()
  await expect(produce.getByTestId('category-notes-empty')).toBeVisible()
  await expect(produce.getByTestId('category-note')).toHaveCount(0)
})

test('adding a note shows it in the list and clears the empty state', async ({ page }) => {
  const frozen = categoryAccordion(page, 'frozen')
  await frozen.locator('summary').click()
  await frozen.getByTestId('category-note-input').fill('nuggets, frozen pizza')
  await frozen.getByTestId('category-note-submit').click()

  await expect(frozen.getByTestId('category-notes-empty')).toHaveCount(0)
  await expect(frozen.getByTestId('category-note')).toHaveCount(1)
  await expect(frozen.getByTestId('category-note')).toContainText('nuggets, frozen pizza')
  // The draft input clears after a successful add, ready for the next note.
  await expect(frozen.getByTestId('category-note-input')).toHaveValue('')
})

test('multiple notes in the same category all list, and a blank submission is a no-op', async ({ page }) => {
  const frozen = categoryAccordion(page, 'frozen')
  await frozen.locator('summary').click()

  // Waiting for the first note to land before typing the second is
  // deliberate, not just pacing: the submit handler is async (Dexie write
  // then clears the draft input), and Playwright's click() only waits for
  // the click event itself, not that handler's completion — firing both
  // submits back-to-back would race the second fill against the first
  // submit's own draft-clearing, wiping the second note's text before it's
  // ever added. A real user can't type that fast, so this isn't a bug in
  // the app, just something this test has to respect.
  await frozen.getByTestId('category-note-input').fill('nuggets')
  await frozen.getByTestId('category-note-submit').click()
  await expect(frozen.getByTestId('category-note')).toHaveCount(1)

  await frozen.getByTestId('category-note-input').fill('frozen pizza')
  await frozen.getByTestId('category-note-submit').click()
  await expect(frozen.getByTestId('category-note')).toHaveCount(2)

  // Whitespace-only text must not create a blank note.
  await frozen.getByTestId('category-note-input').fill('   ')
  await frozen.getByTestId('category-note-submit').click()
  await expect(frozen.getByTestId('category-note')).toHaveCount(2)
})

test('removing a note deletes it and restores the empty state once the last one is gone', async ({ page }) => {
  const frozen = categoryAccordion(page, 'frozen')
  await frozen.locator('summary').click()
  await frozen.getByTestId('category-note-input').fill('nuggets, frozen pizza')
  await frozen.getByTestId('category-note-submit').click()
  await expect(frozen.getByTestId('category-note')).toHaveCount(1)

  await frozen.getByTestId('category-note-remove').click()
  await expect(frozen.getByTestId('category-note')).toHaveCount(0)
  await expect(frozen.getByTestId('category-notes-empty')).toBeVisible()
})

test('notes stay scoped to their own category, not shared across categories', async ({ page }) => {
  const frozen = categoryAccordion(page, 'frozen')
  await frozen.locator('summary').click()
  await frozen.getByTestId('category-note-input').fill('nuggets, frozen pizza')
  await frozen.getByTestId('category-note-submit').click()
  await expect(frozen.getByTestId('category-note')).toHaveCount(1)

  const snacks = categoryAccordion(page, 'snacks')
  await snacks.locator('summary').click()
  await expect(snacks.getByTestId('category-notes-empty')).toBeVisible()
  await expect(snacks.getByTestId('category-note')).toHaveCount(0)
})

test('notes persist across reload', async ({ page }) => {
  const frozen = categoryAccordion(page, 'frozen')
  await frozen.locator('summary').click()
  await frozen.getByTestId('category-note-input').fill('nuggets, frozen pizza')
  await frozen.getByTestId('category-note-submit').click()
  await expect(frozen.getByTestId('category-note')).toHaveCount(1)

  await page.reload()
  await page.getByTestId('nav-customize').click()
  const frozenAfterReload = categoryAccordion(page, 'frozen')
  await frozenAfterReload.locator('summary').click()

  await expect(frozenAfterReload.getByTestId('category-note')).toHaveCount(1)
  await expect(frozenAfterReload.getByTestId('category-note')).toContainText('nuggets, frozen pizza')
})
