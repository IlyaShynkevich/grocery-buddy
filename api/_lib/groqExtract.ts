import { CATEGORIES } from '../../src/db/categories.js'

const GROQ_MODEL = 'qwen/qwen3.6-27b'
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions'
const TIMEOUT_MS = 25_000
// Groq's own dashboard confirmed every json_validate_failed 400 for a
// complex receipt (many items, coupons, deposit/Pfand lines) showed
// output_tokens: 4096 exactly, every single time — the model was being cut
// off mid-response by the old limit, not intermittently rate-limited or
// producing genuinely malformed JSON on its own. Raised with real headroom
// for complex receipts; the salvage-based parsing below (parseExtractedItems)
// is a second, independent safety net for whatever still gets truncated at
// this limit (or fails for any other reason), not a substitute for giving
// the model enough room to finish in the first place.
const MAX_COMPLETION_TOKENS = 8000

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
): Promise<ExtractedItem[]> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

  let response: Response
  try {
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
        max_completion_tokens: MAX_COMPLETION_TOKENS,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Groq request timed out')
    }
    throw new Error(`Groq request failed: ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    clearTimeout(timeout)
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new GroqHttpError(response.status, `Groq returned ${response.status}: ${body.slice(0, 300)}`)
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new Error('Groq response was not valid JSON')
  }

  const content = (payload as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0]
    ?.message?.content
  if (typeof content !== 'string') {
    throw new Error('Groq response had no message content')
  }

  return parseExtractedItems(content)
}

/**
 * TEMPORARY DEBUG LOGGING — a receipt was failing extraction on every
 * attempt with "Groq response was not parseable JSON", and we had no
 * visibility into what Groq actually sent back, only that it didn't parse.
 * Logs the full raw content on that specific failure (and, separately, how
 * many objects the salvage pass below recovered vs. had to skip) so the
 * actual malformed text is visible in Vercel's logs instead of just the
 * fact of failure. Search for TEMP_DEBUG_PARSE_FAILURE to find/remove this
 * once the root cause behind a *fully* unrecoverable response (if any still
 * occur after the salvage pass below) is identified; it doesn't change what
 * gets returned or thrown, only what gets logged.
 */
const DEBUG_TAG = '[TEMP_DEBUG_PARSE_FAILURE]'

/** Exported separately so malformed/garbage-content handling can be tested directly. */
export function parseExtractedItems(content: string): ExtractedItem[] {
  const stripped = stripCodeFence(content)

  const strictItems = tryStrictParse(stripped)
  if (strictItems) return itemsFromRaw(strictItems)

  // The response as a whole isn't valid JSON — a single bad escape, an
  // unterminated string, truncation from hitting max_completion_tokens, ...
  // That used to mean the entire extraction failed even when most of the
  // response was fine (e.g. 12 good items and one malformed coupon line).
  // Salvage whatever complete item objects are actually present instead of
  // discarding all of them over one bad one.
  console.log(DEBUG_TAG, 'strict JSON.parse failed on Groq content, attempting salvage', {
    contentLength: content.length,
    content,
  })

  const { objects: salvaged, skipped } = salvageItemObjects(stripped)
  console.log(DEBUG_TAG, 'salvage pass complete', { recovered: salvaged.length, skipped })

  if (salvaged.length === 0) {
    throw new Error('Groq response was not parseable JSON and no items could be salvaged from it')
  }
  return itemsFromRaw(salvaged)
}

/**
 * Strict, fast path: the response is exactly the well-formed JSON the
 * prompt asked for. Returns null (never throws) so the caller can fall
 * through to the salvage pass — this function's behavior for a
 * well-formed response is unchanged from before.
 */
function tryStrictParse(stripped: string): unknown[] | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(stripped)
  } catch {
    return null
  }
  const rawItems = Array.isArray(parsed) ? parsed : (parsed as { items?: unknown } | null)?.items
  return Array.isArray(rawItems) ? rawItems : null
}

/**
 * Walks the raw text looking for the items array and pulls out every
 * syntactically complete top-level `{...}` object inside it, JSON-parsing
 * each independently. An object that's itself malformed — or a dangling one
 * at the very end, never closed because the response got cut off — is just
 * skipped, instead of one bad object taking down every other item that
 * parsed fine.
 *
 * Known limitation, not silently glossed over: this tracks string vs.
 * non-string state by counting unescaped `"` characters. If a malformed
 * item's own break is an odd number of stray unescaped quotes (rather than,
 * say, a bad number, a missing comma, or plain truncation — the far more
 * likely causes here, per this file's own history of hitting
 * max_completion_tokens on receipts with many line items), that desyncs
 * string-tracking for the rest of the document and can cause later,
 * otherwise-valid objects to be swept into the same broken span. This is
 * still strictly no worse than before (which discarded 100% of items on
 * any malformed byte anywhere in the response) — see the debug logging
 * above for confirming which failure mode a given receipt actually hit.
 */
function salvageItemObjects(content: string): { objects: unknown[]; skipped: number } {
  const arrayStart = findItemsArrayStart(content)
  if (arrayStart === -1) return { objects: [], skipped: 0 }

  const objects: unknown[] = []
  let skipped = 0
  let depth = 0
  let objStart = -1
  let inString = false
  let escaped = false

  for (let i = arrayStart; i < content.length; i++) {
    const char = content[i]

    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }

    if (char === '"') {
      inString = true
      continue
    }

    if (depth === 0 && char === ']') break // end of the items array

    if (char === '{') {
      if (depth === 0) objStart = i
      depth++
    } else if (char === '}') {
      depth = Math.max(0, depth - 1)
      if (depth === 0 && objStart !== -1) {
        const candidate = content.slice(objStart, i + 1)
        try {
          objects.push(JSON.parse(candidate))
        } catch {
          // This one object is malformed (or its boundaries got thrown off
          // by a quote-parity issue upstream) — skip just it and keep
          // scanning for the next one.
          skipped++
        }
        objStart = -1
      }
    }
  }
  // Anything left dangling in objStart (an opening `{` with no matching `}`
  // before the array ended or the response was truncated) is simply never
  // pushed — that's the desired behavior, not an oversight.

  return { objects, skipped }
}

function findItemsArrayStart(content: string): number {
  const keyed = /"items"\s*:\s*\[/.exec(content)
  if (keyed) return keyed.index + keyed[0].length
  return content.indexOf('[')
}

function itemsFromRaw(rawItems: unknown[]): ExtractedItem[] {
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
