import { perfMark } from '../perf/perfLog'

export interface ExtractedItem {
  name: string
  price: number
  category: string
  /** true for a coupon/discount line, not a purchasable product */
  isDiscount?: boolean
  /** null unless a personal category note flagged this item as an exception to its category's usual essential/non-essential default */
  essentialOverride?: boolean | null
}

/** Mirrors api/_lib/openaiExtract.ts's ExtractionResult. */
export interface ExtractionResult {
  items: ExtractedItem[]
  /** ISO 'YYYY-MM-DD' read off the receipt, or null if it has no legible date */
  purchaseDate: string | null
  /** Set when the AI returned a date that couldn't be parsed — shown in the review panel, never dropped silently */
  purchaseDateError: string | null
}

/** A category's personal notes (see useCategoryNotes/CustomizePage), grouped for the extraction request. */
export interface CategoryNoteHint {
  /** key into CATEGORIES */
  category: string
  notes: string[]
}

/** Thrown for a non-2xx /api/extract-receipt response; carries the real HTTP status. */
export class ExtractionRequestError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ExtractionRequestError'
    this.status = status
  }
}

const MAX_DIMENSION = 1600
const JPEG_QUALITY = 0.8

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Sends a receipt photo to /api/extract-receipt and returns the extracted
 * items and purchase date. Resizes/re-encodes the image first: phone camera
 * photos (several MB) plus base64's ~37% overhead can exceed Vercel's 4.5MB
 * function request-body limit, so this keeps requests reliably small.
 */
export async function extractReceipt(imageBlob: Blob, categoryNotes: CategoryNoteHint[] = []): Promise<ExtractionResult> {
  const dataUrl = await toUploadDataUrl(imageBlob)

  perfMark(`request sent (${Math.round(dataUrl.length / 1024)} KB)`)
  const response = await fetch('/api/extract-receipt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // "notes" is only included when non-empty, so a user with no category
    // notes set sends the exact same request body as before this existed.
    body: JSON.stringify(categoryNotes.length > 0 ? { image: dataUrl, notes: categoryNotes } : { image: dataUrl }),
  })
  perfMark(`response received (${response.status})`)

  const body = await response.json().catch(() => null)

  if (!response.ok) {
    const message = (body as { error?: unknown } | null)?.error
    throw new ExtractionRequestError(
      response.status,
      typeof message === 'string' ? message : `Extraction failed (${response.status})`,
    )
  }

  if ((body as { demo?: unknown } | null)?.demo === true) {
    // Tagged with a stable "(demo mode)" marker, same convention
    // openaiExtract.ts already uses for "(token limit)"/"(truncated)", so
    // errorMessage.ts's isDemoModeError can tell this apart from a real
    // failure and show a friendly explanation instead of a generic error.
    throw new Error('Receipt scanning is disabled (demo mode): this deployment has no OPENAI_API_KEY configured')
  }

  const record = body as { items?: unknown; purchaseDate?: unknown; purchaseDateError?: unknown } | null
  const items = record?.items
  if (!Array.isArray(items)) {
    throw new Error('Extraction response was malformed')
  }

  const purchaseDate = record?.purchaseDate
  if (purchaseDate !== null && !(typeof purchaseDate === 'string' && ISO_DATE.test(purchaseDate))) {
    throw new Error(`Extraction response had a malformed purchaseDate: ${JSON.stringify(purchaseDate)}`)
  }
  const purchaseDateError = record?.purchaseDateError ?? null
  if (purchaseDateError !== null && typeof purchaseDateError !== 'string') {
    throw new Error(`Extraction response had a malformed purchaseDateError: ${JSON.stringify(purchaseDateError)}`)
  }

  return { items: items as ExtractedItem[], purchaseDate, purchaseDateError }
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
