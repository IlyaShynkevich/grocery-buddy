import type { VercelRequest, VercelResponse } from '@vercel/node'
import { extractReceiptItems, normalizeNoteHints, OpenAiHttpError } from './_lib/openaiExtract.js'

// openaiExtract.ts aborts its own OpenAI call at 25s; without this, Vercel's
// platform default (10s Hobby / 15s Pro) would kill the function first on a
// genuinely slow (not rate-limited) OpenAI response, before that abort ever
// fires.
export const config = {
  maxDuration: 30,
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' })
      return
    }

    const body = req.body as { image?: unknown; notes?: unknown } | null
    const image = body?.image
    if (typeof image !== 'string' || !image.startsWith('data:image/')) {
      res.status(400).json({ error: 'Missing or invalid "image" data URL' })
      return
    }
    const notes = normalizeNoteHints(body?.notes)

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      // A public deployment (e.g. a Vercel Preview without secrets
      // configured) shouldn't 500 here — that reads as a server crash. This
      // is a deliberate, detectable "the AI step is turned off" response
      // instead, so the frontend can show a friendly demo-mode explanation
      // rather than a generic error (see extractReceipt.ts's demo check).
      res.status(200).json({ items: [], demo: true })
      return
    }

    try {
      const items = await extractReceiptItems(image, apiKey, notes)
      res.status(200).json({ items })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown extraction error'
      // Forward OpenAI's own 4xx as-is (429, 400, 413, ...) — those describe
      // something about our request and are genuinely useful in Vercel's
      // logs instead of reading as a crash. An OpenAI 5xx (or a transport/
      // timeout/parse failure with no real response at all) stays a 502:
      // "this server, acting as a gateway, got an invalid response from the
      // upstream" is the accurate description either way.
      const status = err instanceof OpenAiHttpError && err.status >= 400 && err.status < 500 ? err.status : 502
      res.status(status).json({ error: message })
    }
  } catch (error) {
    // Top-level safety net: Vercel returns a bare 502 with no diagnostics if
    // a serverless function throws uncaught, so anything that escapes the
    // extraction-specific handling above still needs to be caught, logged,
    // and turned into a real JSON response.
    console.error('UNHANDLED_HANDLER_ERROR:', error)
    const message = error instanceof Error ? error.message : 'Unknown server error'
    res.status(500).json({ error: message })
  }
}
