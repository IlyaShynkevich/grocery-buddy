import type { VercelRequest, VercelResponse } from '@vercel/node'
import { extractReceiptItems, GroqHttpError } from './_lib/groqExtract.js'

// groqExtract.ts aborts its own Groq call at 25s; without this, Vercel's
// platform default (10s Hobby / 15s Pro) would kill the function first on a
// genuinely slow (not rate-limited) Groq response, before that abort ever
// fires.
export const config = {
  maxDuration: 30,
}

/**
 * TEMPORARY DEBUG LOGGING — added to diagnose 400s where Vercel's own
 * "External APIs" panel shows no outgoing request at all, meaning the
 * failure happens somewhere in our own code before Groq is ever called
 * (ruling out the earlier "Groq 429/4xx" explanation, which always implies
 * a real outgoing request). Logs one line per meaningful step of this
 * handler — receiving the image, validating it, checking the API key,
 * handing off to extractReceiptItems — each tagged with a per-request id so
 * concurrent invocations' logs don't interleave into a confusing mess in
 * Vercel's log viewer. Search for DEBUG_TAG to find/remove every line this
 * added once the failing step is identified; nothing here changes behavior.
 */
const DEBUG_TAG = '[TEMP_DEBUG_EXTRACT]'

function debugLog(requestId: string, step: string, details?: Record<string, unknown>) {
  console.log(`${DEBUG_TAG} ${requestId} ${step}`, details ?? {})
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  debugLog(requestId, 'handler invoked', {
    method: req.method,
    contentType: req.headers['content-type'] ?? null,
    hasBody: req.body !== undefined && req.body !== null,
  })

  try {
    if (req.method !== 'POST') {
      debugLog(requestId, 'rejected before Groq: method not allowed', { method: req.method })
      res.status(405).json({ error: 'Method not allowed' })
      return
    }

    const image = (req.body as { image?: unknown } | null)?.image
    debugLog(requestId, 'received image field', {
      type: typeof image,
      length: typeof image === 'string' ? image.length : null,
      // Just the data-URL prefix (e.g. "data:image/jpeg;base64,") — never
      // the payload itself, which would flood the logs with base64.
      prefix: typeof image === 'string' ? image.slice(0, 30) : null,
    })
    if (typeof image !== 'string' || !image.startsWith('data:image/')) {
      debugLog(requestId, 'rejected before Groq: missing or invalid image data URL', { type: typeof image })
      res.status(400).json({ error: 'Missing or invalid "image" data URL' })
      return
    }

    const apiKey = process.env.GROQ_API_KEY
    debugLog(requestId, 'checked GROQ_API_KEY', { present: !!apiKey })
    if (!apiKey) {
      debugLog(requestId, 'rejected before Groq: GROQ_API_KEY not configured')
      res.status(500).json({ error: 'Server is not configured with GROQ_API_KEY' })
      return
    }

    try {
      debugLog(requestId, 'validation passed, handing off to extractReceiptItems (about to call Groq)')
      const items = await extractReceiptItems(image, apiKey, undefined, requestId)
      debugLog(requestId, 'extraction succeeded', { itemCount: items.length })
      res.status(200).json({ items })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown extraction error'
      debugLog(requestId, 'extraction failed', {
        message,
        errorName: err instanceof Error ? err.name : typeof err,
        isGroqHttpError: err instanceof GroqHttpError,
        groqStatus: err instanceof GroqHttpError ? err.status : null,
      })
      // Forward Groq's own 4xx as-is (429, 400, 413, ...) — those describe
      // something about our request and are genuinely useful in Vercel's
      // logs instead of reading as a crash. A Groq 5xx (or a transport/
      // timeout/parse failure with no real response at all) stays a 502:
      // "this server, acting as a gateway, got an invalid response from the
      // upstream" is the accurate description either way.
      const status = err instanceof GroqHttpError && err.status >= 400 && err.status < 500 ? err.status : 502
      res.status(status).json({ error: message })
    }
  } catch (error) {
    // Top-level safety net: Vercel returns a bare 502 with no diagnostics if
    // a serverless function throws uncaught, so anything that escapes the
    // extraction-specific handling above still needs to be caught, logged,
    // and turned into a real JSON response.
    console.error('UNHANDLED_HANDLER_ERROR:', error)
    debugLog(requestId, 'unhandled handler error (escaped the inner try/catch)', {
      message: error instanceof Error ? error.message : String(error),
      errorName: error instanceof Error ? error.name : typeof error,
    })
    const message = error instanceof Error ? error.message : 'Unknown server error'
    res.status(500).json({ error: message })
  }
}
