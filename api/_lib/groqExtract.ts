import { CATEGORIES } from '../../src/db/categories.js'

const GROQ_MODEL = 'qwen/qwen3.6-27b'
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions'
const TIMEOUT_MS = 25_000

export interface ExtractedItem {
  name: string
  price: number
  category: string
}

const CATEGORY_KEYS = CATEGORIES.map((category) => category.key)

const SYSTEM_PROMPT = `You extract line items from a photo of a grocery store receipt.
Respond with ONLY a JSON object of the shape {"items": [{"name": string, "price": number, "category": string}]}.
- "price" is the item's paid price in the receipt's currency, as a plain number (no currency symbol, no thousands separators).
- "category" must be exactly one of: ${CATEGORY_KEYS.join(', ')}. Pick the closest match; use "other" if unsure.
- Skip subtotal, tax, total, discount, and payment-method lines — only include purchased items.
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
        max_completion_tokens: 4096,
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
    throw new Error(`Groq returned ${response.status}: ${body.slice(0, 300)}`)
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

  // TEMPORARY DEBUG LOGGING — remove once the extraction issue is diagnosed.
  console.log('RAW_GROQ_RESPONSE:', content)

  return parseExtractedItems(content)
}

/** Exported separately so malformed/garbage-content handling can be tested directly. */
export function parseExtractedItems(content: string): ExtractedItem[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(stripCodeFence(content))
  } catch (err) {
    // TEMPORARY DEBUG LOGGING — remove once the extraction issue is diagnosed.
    console.log('PARSE_ERROR:', err instanceof Error ? err.message : String(err))
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
    const price = Number(record.price)
    const categoryRaw = typeof record.category === 'string' ? record.category : ''
    if (!name || !Number.isFinite(price) || price < 0) continue
    const category = CATEGORY_KEYS.includes(categoryRaw) ? categoryRaw : 'other'
    items.push({ name, price, category })
  }

  // TEMPORARY DEBUG LOGGING — remove once the extraction issue is diagnosed.
  console.log('PARSED_ITEMS_COUNT:', items.length)
  console.log('PARSED_ITEMS:', JSON.stringify(items))

  return items
}

function stripCodeFence(text: string): string {
  const trimmed = text.trim()
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed)
  return fenced ? fenced[1] : trimmed
}
