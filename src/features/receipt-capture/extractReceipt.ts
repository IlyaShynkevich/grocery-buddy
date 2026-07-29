export interface ExtractedItem {
  name: string
  price: number
  category: string
  /** true for a coupon/discount line, not a purchasable product */
  isDiscount?: boolean
}

const MAX_DIMENSION = 1600
const JPEG_QUALITY = 0.8

/**
 * Sends a receipt photo to /api/extract-receipt and returns the extracted
 * items. Resizes/re-encodes the image first: phone camera photos (several
 * MB) plus base64's ~37% overhead can exceed Vercel's 4.5MB function
 * request-body limit, so this keeps requests reliably small.
 */
export async function extractReceiptItems(imageBlob: Blob): Promise<ExtractedItem[]> {
  const dataUrl = await toUploadDataUrl(imageBlob)

  const response = await fetch('/api/extract-receipt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: dataUrl }),
  })

  const body = await response.json().catch(() => null)

  if (!response.ok) {
    const message = (body as { error?: unknown } | null)?.error
    throw new Error(typeof message === 'string' ? message : `Extraction failed (${response.status})`)
  }

  const items = (body as { items?: unknown } | null)?.items
  if (!Array.isArray(items)) {
    throw new Error('Extraction response was malformed')
  }

  return items as ExtractedItem[]
}

async function toUploadDataUrl(blob: Blob): Promise<string> {
  const bitmap = await createImageBitmap(blob)
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is not supported in this browser')
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const resizedBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error('Failed to encode image'))),
      'image/jpeg',
      JPEG_QUALITY,
    )
  })

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read image'))
    reader.readAsDataURL(resizedBlob)
  })
}
