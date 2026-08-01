/**
 * Maps a raw extraction error (Groq's own error text, a parse failure, a
 * network error, etc.) to a short, human-readable message for display.
 * The raw error is still logged via console.error wherever it's caught —
 * this only changes what the user sees, never what gets logged.
 *
 * `status` is the real HTTP status our API responded with, when we have
 * one (a network/timeout failure never reaches that point, so it stays
 * undefined) — it's the primary signal for a rate limit; the message-text
 * regex is kept only as a fallback for older stored receipts or a status
 * that didn't make it through for some other reason.
 */
/**
 * True for Groq's `"type": "tokens"` / `"code": "rate_limit_exceeded"`
 * variant (tagged server-side in groqExtract.ts with a stable "(token
 * limit)" marker) — the request itself was too large for the account's
 * tokens-per-minute limit, not an ordinary "too many requests" rate limit.
 * Retrying the same image won't succeed, so callers should treat this as
 * non-retryable rather than scheduling/showing the countdown-retry UI.
 */
export function isGroqTokenLimitError(rawMessage: string, status?: number): boolean {
  return status === 429 && /\(token limit\)/.test(rawMessage)
}

export function getUserFacingErrorMessage(rawMessage: string, status?: number): string {
  if (isGroqTokenLimitError(rawMessage, status)) {
    return 'Receipt image too large for current plan — try a clearer/smaller photo'
  }

  if (status === 429 || /\b429\b/.test(rawMessage)) {
    return 'Too many requests — retrying automatically'
  }

  if (/\bjson\b|items array|message content|response was malformed/i.test(rawMessage)) {
    return "Couldn't read this receipt — try again"
  }

  if (/timed out|request failed|failed to fetch|networkerror|\bnetwork\b/i.test(rawMessage)) {
    return 'Connection issue — try again'
  }

  return 'Something went wrong — try again'
}
