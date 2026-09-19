import { expect, test, type Page } from './fixtures'

/** A real JPEG of the given size, drawn in the page (no image fixtures checked in). */
async function makeJpeg(page: Page, width: number, height: number): Promise<Buffer> {
  const base64 = await page.evaluate(
    async ({ width, height }) => {
      const canvas = new OffscreenCanvas(width, height)
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('no 2d context')
      const gradient = ctx.createLinearGradient(0, 0, width, height)
      gradient.addColorStop(0, '#f2efe8')
      gradient.addColorStop(1, '#3d3128')
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, width, height)
      ctx.fillStyle = '#111'
      ctx.font = `${Math.round(height / 40)}px monospace`
      for (let i = 0; i < 30; i++) ctx.fillText(`VOLLMILCH 3,5% 1L   1,19 A   #${i}`, width * 0.05, (i + 1) * (height / 32))
      const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 })
      const bytes = new Uint8Array(await blob.arrayBuffer())
      let binary = ''
      for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
      return btoa(binary)
    },
    { width, height },
  )
  return Buffer.from(base64, 'base64')
}

interface StoredPhoto {
  width: number
  height: number
  size: number
  type: string
  base64: string
}

/** Every stored receipt photo, read straight from IndexedDB. */
function storedPhotos(page: Page): Promise<StoredPhoto[]> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('grocery-buddy')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const rows = await new Promise<{ imageBlob: Blob }[]>((resolve, reject) => {
      const request = db.transaction('pendingReceipts').objectStore('pendingReceipts').getAll()
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    db.close()
    return Promise.all(
      rows.map(async ({ imageBlob }) => {
        const bitmap = await createImageBitmap(imageBlob)
        const bytes = new Uint8Array(await imageBlob.arrayBuffer())
        let binary = ''
        for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
        const photo = { width: bitmap.width, height: bitmap.height, size: imageBlob.size, type: imageBlob.type, base64: btoa(binary) }
        bitmap.close()
        return photo
      }),
    )
  })
}

async function capture(page: Page, buffer: Buffer, mimeType = 'image/jpeg') {
  await page.getByTestId('receipt-capture-input').setInputFiles({ name: 'photo.jpg', mimeType, buffer })
}

test('a camera-sized photo is stored shrunk to 1600px on its longest side, not at original size', async ({ page }) => {
  await page.goto('/')
  const original = await makeJpeg(page, 4080, 3072)

  await capture(page, original)
  await expect(page.getByTestId('receipt-item')).toHaveCount(1)

  const [stored] = await storedPhotos(page)
  expect(stored.type).toBe('image/jpeg')
  expect([stored.width, stored.height]).toEqual([1600, 1205])
  expect(stored.size).toBeLessThan(original.length / 3)
})

test('a portrait photo keeps its orientation when shrunk', async ({ page }) => {
  await page.goto('/')
  await capture(page, await makeJpeg(page, 3072, 4080))
  await expect(page.getByTestId('receipt-item')).toHaveCount(1)

  const [stored] = await storedPhotos(page)
  expect([stored.width, stored.height]).toEqual([1205, 1600])
})

test('a JPEG already within 1600px is stored byte-for-byte, and uploaded as-is without re-encoding', async ({
  page,
}) => {
  let uploadedImage: string | undefined
  await page.route('**/api/extract-receipt', (route) => {
    uploadedImage = route.request().postDataJSON().image
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ purchaseDate: null, items: [{ name: 'Milk', price: 1.19, category: 'dairy' }] }),
    })
  })

  await page.goto('/')
  const small = await makeJpeg(page, 1200, 900)
  await capture(page, small)
  await expect(page.getByTestId('receipt-item')).toHaveCount(1)

  const [stored] = await storedPhotos(page)
  expect(stored.size).toBe(small.length)
  expect(stored.base64).toBe(small.toString('base64'))

  await page.getByTestId('receipt-process-button').click()
  await expect(page.getByTestId('receipt-status')).toHaveText('Processed')
  expect(uploadedImage).toBe(`data:image/jpeg;base64,${small.toString('base64')}`)
})

test('"Preparing photo…" shows while the photo is being shrunk, then gives way to the receipt row', async ({
  page,
}) => {
  // Stretch the decode so the state is reliably observable — on a phone a
  // 50MP photo takes up to ~1s here on its own.
  await page.addInitScript(() => {
    const original = window.createImageBitmap
    window.createImageBitmap = (async (...args: Parameters<typeof createImageBitmap>) => {
      await new Promise((resolve) => setTimeout(resolve, 1000))
      return original(...args)
    }) as typeof createImageBitmap
  })
  await page.goto('/')
  const photo = await makeJpeg(page, 4080, 3072)

  await capture(page, photo)
  const preparing = page.getByTestId('receipt-preparing-photo')
  await expect(preparing).toBeVisible()
  await expect(preparing).toContainText('Preparing photo')
  await expect(page.getByTestId('receipt-item')).toHaveCount(0)

  await expect(page.getByTestId('receipt-item')).toHaveCount(1)
  await expect(preparing).toHaveCount(0)
})

test('a photo that cannot be read is rejected with a visible error and nothing is stored', async ({ page }) => {
  await page.goto('/')
  await capture(page, Buffer.from('definitely not a jpeg'))

  const error = page.getByTestId('receipt-capture-error')
  await expect(error).toBeVisible()
  await expect(error).toContainText("Couldn't read this photo")
  await expect(page.getByTestId('receipt-preparing-photo')).toHaveCount(0)
  await expect(page.getByTestId('receipt-item')).toHaveCount(0)
  expect(await storedPhotos(page)).toEqual([])
})
