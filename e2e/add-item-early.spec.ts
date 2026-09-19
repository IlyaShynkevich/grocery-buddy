import { expect, test } from './fixtures'

async function itemNames(page: import('./fixtures').Page): Promise<string[]> {
  return page.getByTestId('shopping-list-item').locator('input[type="text"]').evaluateAll((inputs) =>
    inputs.map((input) => (input as HTMLInputElement).value),
  )
}

test('an item added before the active trip has loaded is kept, not silently dropped', async ({ page }) => {
  // Delay the app's first IndexedDB open so the active trip resolves late —
  // like a slow phone — while the add-item form is already on screen.
  await page.addInitScript(() => {
    const open = indexedDB.open.bind(indexedDB)
    let delayed = false
    indexedDB.open = ((...args: Parameters<typeof indexedDB.open>) => {
      const request = open(...args)
      const addListener = request.addEventListener.bind(request)
      Object.defineProperty(request, 'onsuccess', {
        set(handler: (this: IDBOpenDBRequest, event: Event) => void) {
          const wait = delayed ? 0 : 800
          delayed = true
          addListener('success', (event: Event) => setTimeout(() => handler.call(request, event), wait))
        },
      })
      return request
    }) as typeof indexedDB.open
  })
  await page.goto('/', { waitUntil: 'commit' })

  await page.getByTestId('add-item-input').fill('Bananas')
  // Proves the scenario: the trip genuinely hasn't loaded when Add is tapped.
  expect(await page.getByTestId('shopping-list').getAttribute('data-trip-id')).toBe('')
  await page.getByTestId('add-item-submit').click()

  await expect.poll(() => itemNames(page), { timeout: 5000 }).toEqual(['Bananas'])
})

test('if adding an item fails, the error is shown and the typed text is kept', async ({ page }) => {
  await page.addInitScript(() => {
    const original = IDBObjectStore.prototype.add
    IDBObjectStore.prototype.add = function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['add']>) {
      if (this.name === 'items') throw new DOMException('Simulated storage failure', 'UnknownError')
      return original.apply(this, args)
    }
  })
  await page.goto('/')
  await expect(page.getByTestId('shopping-list')).not.toHaveAttribute('data-trip-id', '')

  await page.getByTestId('add-item-input').fill('Bananas')
  await page.getByTestId('add-item-submit').click()

  await expect(page.getByTestId('add-item-error')).toContainText('Item not added')
  await expect(page.getByTestId('add-item-error')).toContainText('Simulated storage failure')
  await expect(page.getByTestId('add-item-input')).toHaveValue('Bananas')
  expect(await itemNames(page)).toEqual([])
})
