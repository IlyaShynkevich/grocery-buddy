import { CATEGORIES } from '../../src/db/categories.js'

const GROQ_MODEL = 'qwen/qwen3.6-27b'
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions'
const TIMEOUT_MS = 25_000

export interface ExtractedItem {
  name: string
  price: number
  category: string
  /** true for a coupon/discount line, not a purchasable product */
  isDiscount?: boolean
}

/**
 * Thrown when Groq itself responded with a non-2xx status. Carries that
 * status so the route handler can forward it instead of flattening every
 * extraction failure to a generic 502 (which made real Groq 429s
 * indistinguishable from an actual server crash in Vercel's own logs).
 */
export class GroqHttpError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'GroqHttpError'
    this.status = status
  }
}

const CATEGORY_KEYS = CATEGORIES.map((category) => category.key)

// TEMPORARY DEBUG LOGGING — see the matching DEBUG_TAG comment in
// api/extract-receipt.ts for why this exists. `requestId` is optional so
// this function stays usable on its own (e.g. from a standalone script or a
// future test) without a caller having to invent one.
const DEBUG_TAG = '[TEMP_DEBUG_EXTRACT]'

function debugLog(requestId: string | undefined, step: string, details?: Record<string, unknown>) {
  console.log(`${DEBUG_TAG} ${requestId ?? '(no id)'} ${step}`, details ?? {})
}

const SYSTEM_PROMPT = `You extract line items from a photo of a grocery store receipt.
Respond with ONLY a JSON object of the shape {"items": [{"name": string, "price": number, "category": string, "isDiscount": boolean}]}.
- "price" is the item's paid price in the receipt's currency, as a plain number (no currency symbol, no thousands separators).
- "category" must be exactly one of: ${CATEGORY_KEYS.join(', ')}. Pick the closest match; use "other" if unsure.
- Skip subtotal, tax, total, and payment-method lines — only include purchased items and discounts.
- Coupon/discount lines (e.g. "Coupon Herzstuecke -0,38") are not purchasable products: include them with "isDiscount": true, "price" as a negative number equal to the discount amount, and "category" set to "other".
- For regular purchased items, set "isDiscount": false.
- If the photo is not a legible receipt, respond with {"items": []}.
Output raw JSON only. No markdown code fences, no commentary before or after.`

/**
 * Calls Groq's vision model to extract line items from a receipt photo.
 * `fetchImpl` is injectable so error-handling paths (timeouts, bad
 * responses, garbage content) can be exercised with a fake fetch in tests
 * without hitting the real API.
 */
export async function extractReceiptItems(
  imageDataUrl: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
  requestId?: string,
): Promise<ExtractedItem[]> {
  debugLog(requestId, 'preparing Groq request', {
    endpoint: GROQ_ENDPOINT,
    model: GROQ_MODEL,
    imageDataUrlLength: imageDataUrl.length,
    apiKeyPresent: !!apiKey,
    apiKeyLength: apiKey.length,
  })

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

  let response: Response
  try {
    debugLog(requestId, 'sending fetch to Groq')
    response = await fetchImpl(GROQ_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Extract the items from this receipt.' },
              { type: 'image_url', image_url: { url: imageDataUrl } },
            ],
          },
        ],
        temperature: 0,
        max_completion_tokens: 4096,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    })
    debugLog(requestId, 'fetch to Groq returned a response', { status: response.status, ok: response.ok })
  } catch (err) {
    debugLog(requestId, 'fetch to Groq threw (never got a response)', {
      errorName: err instanceof Error ? err.name : typeof err,
      message: err instanceof Error ? err.message : String(err),
    })
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Groq request timed out')
    }
    throw new Error(`Groq request failed: ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    clearTimeout(timeout)
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    debugLog(requestId, 'Groq responded with a non-2xx status', { status: response.status, bodyPreview: body.slice(0, 300) })
    throw new GroqHttpError(response.status, `Groq returned ${response.status}: ${body.slice(0, 300)}`)
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    debugLog(requestId, 'Groq response body was not valid JSON')
    throw new Error('Groq response was not valid JSON')
  }

  const content = (payload as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0]
    ?.message?.content
  if (typeof content !== 'string') {
    debugLog(requestId, 'Groq response had no message content', { payloadPreview: JSON.stringify(payload).slice(0, 300) })
    throw new Error('Groq response had no message content')
  }

  debugLog(requestId, 'Groq response parsed successfully, extracting items from content')
  return parseExtractedItems(content)
}

/** Exported separately so malformed/garbage-content handling can be tested directly. */
export function parseExtractedItems(content: string): ExtractedItem[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(stripCodeFence(content))
  } catch {
    throw new Error('Groq response was not parseable JSON')
  }

  const rawItems = Array.isArray(parsed) ? parsed : (parsed as { items?: unknown } | null)?.items
  if (!Array.isArray(rawItems)) {
    throw new Error('Groq response did not contain an items array')
  }

  const items: ExtractedItem[] = []
  for (const raw of rawItems) {
    if (!raw || typeof raw !== 'object') continue
    const record = raw as Record<string, unknown>
    const name = typeof record.name === 'string' ? record.name.trim() : ''
    const rawPrice = Number(record.price)
    const categoryRaw = typeof record.category === 'string' ? record.category : ''
    const isDiscount = record.isDiscount === true
    if (!name || !Number.isFinite(rawPrice)) continue
    // Discounts always net out negative regardless of the sign the model
    // returned; regular items must be non-negative.
    if (!isDiscount && rawPrice < 0) continue
    const price = isDiscount ? -Math.abs(rawPrice) : rawPrice
    const category = CATEGORY_KEYS.includes(categoryRaw) ? categoryRaw : 'other'
    items.push({ name, price, category, isDiscount })
  }

  return items
}

function stripCodeFence(text: string): string {
  const trimmed = text.trim()
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed)
  return fenced ? fenced[1] : trimmed
}
