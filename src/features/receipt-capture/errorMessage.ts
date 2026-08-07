/**
 * True for OpenAI's `"type": "tokens"` / `"code": "rate_limit_exceeded"`
 * variant (tagged server-side in openaiExtract.ts with a stable "(token
 * limit)" marker) — the request itself was too large for the account's
 * tokens-per-minute limit, not an ordinary "too many requests" rate limit.
 * Retrying the same image won't succeed, so callers should treat this as
 * non-retryable rather than scheduling/showing the countdown-retry UI.
 */
export function isOpenAiTokenLimitError(rawMessage: string, status?: number): boolean {
  return status === 429 && /\(token limit\)/.test(rawMessage)
}

/**
 * True for a response OpenAI cut off by hitting max_completion_tokens
 * before it finished generating — a 200 whose `finish_reason` was
 * `"length"` and salvage still couldn't recover any complete items (tagged
 * server-side in openaiExtract.ts with a stable "(truncated)" marker).
 * Unlike the generic "couldn't read this receipt" parse failure, this
 * specific cause means the receipt has more items than fit in one
 * response — retrying the same image won't help, but splitting the receipt
 * across two photos would.
 */
export function isOpenAiTruncationError(rawMessage: string): boolean {
  return /\(truncated\)/.test(rawMessage)
}

/**
 * True for the "no OPENAI_API_KEY configured on this deployment" case
 * (tagged client-side in extractReceipt.ts with a stable "(demo mode)"
 * marker) — a public demo deployment with the AI step deliberately turned
 * off, not a real failure. Callers should show a friendly explanation
 * instead of the generic error styling/copy, and never treat it as
 * retryable (retrying just reaches the same demo response again).
 */
export function isDemoModeError(rawMessage: string): boolean {
  return /\(demo mode\)/.test(rawMessage)
}

/**
 * Maps a raw extraction error (OpenAI's own error text, a parse failure, a
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
export function getUserFacingErrorMessage(rawMessage: string, status?: number): string {
  if (isDemoModeError(rawMessage)) {
    return "Receipt scanning is disabled in this public demo. This is a personal project — check the README to run it with your own API key."
  }

  // Checked before the generic JSON-parse-failure regex below, since a
  // truncation message legitimately contains "JSON"/"message content" text
  // too and would otherwise be swallowed by that broader, less specific match.
  if (isOpenAiTruncationError(rawMessage)) {
    return 'Receipt has too many items to process at once — try splitting it into two photos'
  }

  if (isOpenAiTokenLimitError(rawMessage, status)) {
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
