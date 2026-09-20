import { expect, test, type Page } from './fixtures'

// Same 1x1 PNG fixture used across the other receipt specs.
const SAMPLE_IMAGE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

async function longPress(page: Page, locator: import('@playwright/test').Locator) {
  await locator.hover()
  await page.mouse.down()
  // Comfortably past the component's 500ms long-press threshold.
  await page.waitForTimeout(650)
  await page.mouse.up()
}

/** Sets up a completed trip with three priced items (via a mocked receipt scan) and opens its detail page. */
async function openTripDetailWithItems(page: Page) {
  await page.route('**/api/extract-receipt', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        purchaseDate: null,
        items: [
          { name: 'Milk', price: 3.49, category: 'dairy' },
          { name: 'Bread', price: 2.49, category: 'bakery' },
          { name: 'Eggs', price: 2.99, category: 'dairy' },
        ],
      }),
    }),
  )

  await page.goto('/')
  await page.getByTestId('receipt-capture-input').setInputFiles({
    name: 'receipt.png',
    mimeType: 'image/png',
    buffer: SAMPLE_IMAGE,
  })
  await page.getByTestId('receipt-process-button').click()
  await expect(page.getByTestId('receipt-status').first()).toHaveText('Processed')
  await page.getByTestId('receipt-review-confirm').click()

  await page.getByTestId('save-trip-button').click()
  await page.getByTestId('nav-history').click()
  await page.getByTestId('history-trip').first().click()
  await expect(page.getByTestId('trip-detail-page')).toBeVisible()
  await expect(page.getByTestId('trip-detail-item')).toHaveCount(3)
  await expect(page.getByTestId('trip-detail-total')).toContainText('8,97')
}

function itemRow(page: Page, name: string) {
  return page.locator('[data-testid="trip-detail-item"]', { hasText: name })
}

test('tapping an item shows an inline confirm, and confirming deletes it and updates the total', async ({ page }) => {
  await openTripDetailWithItems(page)

  await itemRow(page, 'Bread').click()
  await expect(itemRow(page, 'Bread').getByTestId('trip-detail-item-delete-confirm')).toBeVisible()
  await expect(itemRow(page, 'Bread')).toContainText('Delete "Bread"?')

  await itemRow(page, 'Bread').getByTestId('trip-detail-item-delete-yes').click()

  await expect(page.getByTestId('trip-detail-item')).toHaveCount(2)
  await expect(itemRow(page, 'Bread')).toHaveCount(0)
  // 3.49 (Milk) + 2.99 (Eggs) = 6.48
  await expect(page.getByTestId('trip-detail-total')).toContainText('6,48')
})

test('cancelling the single-item delete confirm leaves items untouched', async ({ page }) => {
  await openTripDetailWithItems(page)

  await itemRow(page, 'Bread').click()
  await itemRow(page, 'Bread').getByTestId('trip-detail-item-delete-cancel').click()

  await expect(page.getByTestId('trip-detail-item')).toHaveCount(3)
  await expect(itemRow(page, 'Bread')).toBeVisible()
  await expect(page.getByTestId('trip-detail-total')).toContainText('8,97')
})

test('long-pressing an item enters multi-select; selecting more and confirming deletes all of them and updates the total once', async ({
  page,
}) => {
  await openTripDetailWithItems(page)

  await longPress(page, itemRow(page, 'Milk'))
  await expect(page.getByTestId('trip-detail-multiselect-bar')).toBeVisible()
  await expect(page.getByTestId('trip-detail-multiselect-count')).toHaveText('1 selected')
  await expect(itemRow(page, 'Milk')).toHaveAttribute('data-selected', 'true')

  // A plain tap on another item adds it to the selection instead of opening
  // its own single-item confirm.
  await itemRow(page, 'Eggs').click()
  await expect(page.getByTestId('trip-detail-multiselect-count')).toHaveText('2 selected')
  await expect(itemRow(page, 'Eggs')).toHaveAttribute('data-selected', 'true')
  await expect(itemRow(page, 'Eggs').getByTestId('trip-detail-item-delete-confirm')).toHaveCount(0)

  await page.getByTestId('trip-detail-multiselect-delete').click()
  await expect(page.getByTestId('trip-detail-bulk-delete-confirm')).toBeVisible()
  await expect(page.getByTestId('trip-detail-bulk-delete-confirm')).toContainText('Delete these 2 items?')

  await page.getByTestId('trip-detail-bulk-delete-yes').click()

  await expect(page.getByTestId('trip-detail-item')).toHaveCount(1)
  await expect(itemRow(page, 'Bread')).toBeVisible()
  // Only Bread (2.49) survives — both deletions landed and the total
  // reflects exactly one recompute, not a stale intermediate value.
  await expect(page.getByTestId('trip-detail-total')).toContainText('2,49')
  // Multi-select mode itself is exited after a successful bulk delete.
  await expect(page.getByTestId('trip-detail-multiselect-bar')).toHaveCount(0)
})

test('cancelling out of multi-select mode leaves items untouched', async ({ page }) => {
  await openTripDetailWithItems(page)

  await longPress(page, itemRow(page, 'Milk'))
  await itemRow(page, 'Eggs').click()
  await expect(page.getByTestId('trip-detail-multiselect-count')).toHaveText('2 selected')

  await page.getByTestId('trip-detail-multiselect-cancel').click()

  await expect(page.getByTestId('trip-detail-multiselect-bar')).toHaveCount(0)
  await expect(page.getByTestId('trip-detail-item')).toHaveCount(3)
  await expect(page.getByTestId('trip-detail-total')).toContainText('8,97')
})

test('cancelling out of multi-select clears the selected-item styling, not just the selection state', async ({
  page,
}) => {
  await openTripDetailWithItems(page)

  await longPress(page, itemRow(page, 'Milk'))
  await itemRow(page, 'Eggs').click()
  await expect(itemRow(page, 'Milk')).toHaveAttribute('data-selected', 'true')
  await expect(itemRow(page, 'Eggs')).toHaveAttribute('data-selected', 'true')

  await page.getByTestId('trip-detail-multiselect-cancel').click()
  await expect(page.getByTestId('trip-detail-multiselect-bar')).toHaveCount(0)

  // The data attribute clears...
  await expect(itemRow(page, 'Milk')).toHaveAttribute('data-selected', 'false')
  await expect(itemRow(page, 'Eggs')).toHaveAttribute('data-selected', 'false')

  // ...and so does the visual styling itself: the previously-selected rows
  // must carry no selection ring and no lingering selected-state
  // background — the actual bug this guards against is the styling
  // outliving the state, whatever property carries it. (It reads box-shadow
  // and background, not borderColor, since the design pass moved the
  // selected ring off `border` — a border would shunt every row below a
  // selected one down by 2px; box-shadow takes no layout space. Rows 2+ of
  // a grouped list also carry a hairline border-top, so borderColor is no
  // longer even comparable between the first row and the rest.)
  const rowStyles = (name: string) =>
    itemRow(page, name).evaluate((el) => {
      const style = getComputedStyle(el)
      return { boxShadow: style.boxShadow, background: style.backgroundColor }
    })
  const [milk, eggs, bread] = await Promise.all([rowStyles('Milk'), rowStyles('Eggs'), rowStyles('Bread')])
  expect(milk).toEqual(bread)
  expect(eggs).toEqual(bread)
  expect(bread.boxShadow).toBe('none')
})

test('cancelling the bulk-delete confirm returns to the selection instead of deleting', async ({ page }) => {
  await openTripDetailWithItems(page)

  await longPress(page, itemRow(page, 'Milk'))
  await itemRow(page, 'Eggs').click()
  await page.getByTestId('trip-detail-multiselect-delete').click()
  await expect(page.getByTestId('trip-detail-bulk-delete-confirm')).toBeVisible()

  await page.getByTestId('trip-detail-bulk-delete-cancel').click()

  // Still in multi-select, selection intact, nothing deleted.
  await expect(page.getByTestId('trip-detail-bulk-delete-confirm')).toHaveCount(0)
  await expect(page.getByTestId('trip-detail-multiselect-bar')).toBeVisible()
  await expect(page.getByTestId('trip-detail-multiselect-count')).toHaveText('2 selected')
  await expect(page.getByTestId('trip-detail-item')).toHaveCount(3)
  await expect(page.getByTestId('trip-detail-total')).toContainText('8,97')
})

test('the essential/non-essential toggle still works normally outside multi-select, and is not interactive during it', async ({
  page,
}) => {
  await openTripDetailWithItems(page)

  const milkBadge = itemRow(page, 'Milk').getByTestId('trip-detail-item-essential')
  await expect(milkBadge).toHaveText('essential')
  await milkBadge.click()
  await expect(milkBadge).toHaveText('non-essential')

  // A short tap on the badge toggled essential only — it did not also open
  // the item's single-delete confirm underneath it.
  await expect(itemRow(page, 'Milk').getByTestId('trip-detail-item-delete-confirm')).toHaveCount(0)

  await longPress(page, itemRow(page, 'Bread'))
  await expect(page.getByTestId('trip-detail-multiselect-bar')).toBeVisible()
  // No essential-toggle button rendered on any row while multi-select is active.
  await expect(page.getByTestId('trip-detail-item-essential')).toHaveCount(0)
})
