import { CATEGORIES, getCategory } from '../../src/db/categories.js'

const OPENAI_MODEL = 'gpt-4.1-mini'
const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions'
const TIMEOUT_MS = 25_000
// Starting value carried over from the prior provider's tuning (receipts
// with many line items need real headroom to avoid getting cut off
// mid-generation) — revisit if OpenAI truncation (finish_reason: "length")
// actually occurs in practice, same as the salvage/truncation handling
// below already anticipates.
const MAX_COMPLETION_TOKENS = 4500

export interface ExtractedItem {
  name: string
  price: number
  category: string
  /** true for a coupon/discount line, not a purchasable product */
  isDiscount?: boolean
  /** null unless a personal category note (see CategoryNoteHint) flagged this item as an exception to its category's usual essential/non-essential default */
  essentialOverride?: boolean | null
}

/** A category's personal notes (Customize page), grouped for the extraction prompt. */
export interface CategoryNoteHint {
  /** key into CATEGORIES */
  category: string
  notes: string[]
}

const MAX_NOTE_CATEGORIES = CATEGORIES.length
const MAX_NOTES_PER_CATEGORY = 25
const MAX_NOTE_LENGTH = 200

/**
 * Defensive validation for the client-supplied `notes` field: drops
 * anything malformed instead of failing the whole extraction over it, since
 * personalization is a nice-to-have, not core to the request. Also caps
 * sizes so a buggy/adversarial client can't balloon the prompt.
 */
export function normalizeNoteHints(raw: unknown): CategoryNoteHint[] {
  if (!Array.isArray(raw)) return []

  const hints: CategoryNoteHint[] = []
  for (const entry of raw.slice(0, MAX_NOTE_CATEGORIES)) {
    if (!entry || typeof entry !== 'object') continue
    const record = entry as Record<string, unknown>
    const category = typeof record.category === 'string' ? record.category : ''
    if (!CATEGORY_KEYS.includes(category)) continue
    if (!Array.isArray(record.notes)) continue

    const notes = record.notes
      .filter((note): note is string => typeof note === 'string' && note.trim().length > 0)
      .map((note) => note.trim().slice(0, MAX_NOTE_LENGTH))
      .slice(0, MAX_NOTES_PER_CATEGORY)
    if (notes.length > 0) hints.push({ category, notes })
  }
  return hints
}

/**
 * The per-request personalization block appended to the user message when
 * the client sent any category notes — null (added nowhere) otherwise, so a
 * user with no notes set gets the exact same request as before this existed.
 */
export function buildPersonalizationText(notes: CategoryNoteHint[]): string | null {
  if (notes.length === 0) return null

  const lines = notes.map((hint) => {
    const category = getCategory(hint.category)
    const defaultLabel = category.essential ? 'essential by default' : 'non-essential by default'
    return `- ${category.label} (${defaultLabel}): ${hint.notes.join(', ')}`
  })

  return [
    "The user has personal notes for some categories, from a separate customization step (not from this receipt):",
    ...lines,
    'If an extracted item\'s name closely matches one of the words/phrases listed for a category above, use that category, and set "essentialOverride" to the OPPOSITE of that category\'s stated default above — each note marks an item as an exception to its category\'s norm.',
    'Leave "essentialOverride": null for every item that does not match any note.',
  ].join('\n')
}

/**
 * Thrown when OpenAI itself responded with a non-2xx status. Carries that
 * status so the route handler can forward it instead of flattening every
 * extraction failure to a generic 502 (which would make a real OpenAI 429
 * indistinguishable from an actual server crash in Vercel's own logs).
 */
export class OpenAiHttpError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'OpenAiHttpError'
    this.status = status
  }
}

/**
 * True for OpenAI's `"type": "tokens"`, `"code": "rate_limit_exceeded"`
 * error body shape — the request itself (image + prompt) is too large for
 * the account's tokens-per-minute limit, unlike an ordinary 429 where
 * waiting and retrying the same request will eventually succeed.
 */
function isTokenLimitBody(body: string): boolean {
  try {
    const parsed = JSON.parse(body) as { error?: { type?: unknown; code?: unknown } }
    return parsed?.error?.type === 'tokens' && parsed?.error?.code === 'rate_limit_exceeded'
  } catch {
    return false
  }
}

const CATEGORY_KEYS = CATEGORIES.map((category) => category.key)

const SYSTEM_PROMPT = `You extract line items from a photo of a grocery store receipt.
Respond with ONLY a JSON object of the shape {"items": [{"name": string, "price": number, "category": string, "isDiscount": boolean, "essentialOverride": boolean|null}]}.
- "price" is the item's paid price in the receipt's currency, as a plain number (no currency symbol, no thousands separators).
- "category" must be exactly one of: ${CATEGORY_KEYS.join(', ')}. Pick the closest match; use "other" if unsure.
- Skip subtotal, tax, total, and payment-method lines — only include purchased items and discounts.
- Coupon/discount lines (e.g. "Coupon Herzstuecke -0,38") are not purchasable products: include them with "isDiscount": true, "price" as a negative number equal to the discount amount, and "category" set to "other".
- For regular purchased items, set "isDiscount": false.
- "essentialOverride" is null unless the user's own personal category notes (given separately in the user message, if any) say this specific item is an exception to its category's usual essential/non-essential status — see those instructions if present.
- If the photo is not a legible receipt, respond with {"items": []}.
Output raw JSON only. No markdown code fences, no commentary before or after.`

/**
 * Calls OpenAI's vision model to extract line items from a receipt photo.
 * `fetchImpl` is injectable so error-handling paths (timeouts, bad
 * responses, garbage content) can be exercised with a fake fetch in tests
 * without hitting the real API.
 */
export async function extractReceiptItems(
  imageDataUrl: string,
  apiKey: string,
  notes: CategoryNoteHint[] = [],
  fetchImpl: typeof fetch = fetch,
): Promise<ExtractedItem[]> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

  const personalization = buildPersonalizationText(notes)
  const userContent = [
    { type: 'text' as const, text: 'Extract the items from this receipt.' },
    ...(personalization ? [{ type: 'text' as const, text: personalization }] : []),
    { type: 'image_url' as const, image_url: { url: imageDataUrl, detail: 'high' as const } },
  ]

  let response: Response
  try {
    response = await fetchImpl(OPENAI_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userContent },
        ],
        temperature: 0,
        max_completion_tokens: MAX_COMPLETION_TOKENS,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('OpenAI request timed out')
    }
    throw new Error(`OpenAI request failed: ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    clearTimeout(timeout)
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    // OpenAI's "type": "tokens" / "code": "rate_limit_exceeded" variant means
    // the request itself (image + prompt) is too large for the account's
    // tokens-per-minute limit — unlike an ordinary 429, waiting and retrying
    // the same request will just trip the same limit again. Tagged with a
    // stable "(token limit)" marker so the frontend (errorMessage.ts's
    // isOpenAiTokenLimitError) can tell the two apart and skip the
    // countdown-retry UI for this one.
    const isTokenLimit = response.status === 429 && isTokenLimitBody(body)
    const label = isTokenLimit ? ' (token limit)' : ''
    throw new OpenAiHttpError(response.status, `OpenAI returned ${response.status}${label}: ${body.slice(0, 300)}`)
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new Error('OpenAI response was not valid JSON')
  }

  const choice = (
    payload as { choices?: { message?: { content?: unknown }; finish_reason?: unknown }[] }
  )?.choices?.[0]
  const content = choice?.message?.content
  if (typeof content !== 'string') {
    throw new Error('OpenAI response had no message content')
  }

  try {
    return parseExtractedItems(content)
  } catch (err) {
    // A 200 response can still be truncated: OpenAI sets finish_reason:
    // "length" when it stopped generating because max_completion_tokens was
    // hit, surfaced as a "successful" response with incomplete content
    // instead of an error. Only relevant once parseExtractedItems has
    // already failed to salvage anything usable — a finish_reason: "length"
    // response that still yielded complete items via salvage isn't an error
    // at all. Tagged with a "(truncated)" marker so the frontend
    // (errorMessage.ts's isOpenAiTruncationError) can surface a distinct
    // "too many items" message instead of the generic failure one.
    if (choice?.finish_reason === 'length') {
      throw new Error(`OpenAI response was truncated (truncated) by max_completion_tokens: ${content.slice(0, 300)}`)
    }
    throw err
  }
}

/**
 * TEMPORARY DEBUG LOGGING — a receipt was failing extraction on every
 * attempt with "response was not parseable JSON", and we had no visibility
 * into what the model actually sent back, only that it didn't parse. Logs
 * the full raw content on that specific failure (and, separately, how many
 * objects the salvage pass below recovered vs. had to skip) so the actual
 * malformed text is visible in Vercel's logs instead of just the fact of
 * failure. Search for TEMP_DEBUG_PARSE_FAILURE to find/remove this once the
 * root cause behind a *fully* unrecoverable response (if any still occur
 * after the salvage pass below) is identified; it doesn't change what gets
 * returned or thrown, only what gets logged.
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
  console.log(DEBUG_TAG, 'strict JSON.parse failed on model content, attempting salvage', {
    contentLength: content.length,
    content,
  })

  const { objects: salvaged, skipped } = salvageItemObjects(stripped)
  console.log(DEBUG_TAG, 'salvage pass complete', { recovered: salvaged.length, skipped })

  if (salvaged.length === 0) {
    throw new Error('OpenAI response was not parseable JSON and no items could be salvaged from it')
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
 * likely causes, per max_completion_tokens cutoffs on receipts with many
 * line items), that desyncs string-tracking for the rest of the document
 * and can cause later, otherwise-valid objects to be swept into the same
 * broken span. This is still strictly no worse than before (which discarded
 * 100% of items on any malformed byte anywhere in the response) — see the
 * debug logging above for confirming which failure mode a given receipt
 * actually hit.
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
    const essentialOverride = record.essentialOverride === true || record.essentialOverride === false ? record.essentialOverride : null
    items.push({ name, price, category, isDiscount, essentialOverride })
  }

  return items
}

function stripCodeFence(text: string): string {
  const trimmed = text.trim()
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed)
  return fenced ? fenced[1] : trimmed
}
