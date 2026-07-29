const RETRY_AFTER_PATTERN = /try again in\s+(\d+(?:\.\d+)?)\s*s\b/i

/**
 * Parses a Groq rate-limit message like "...Please try again in
 * 16.634999999s..." into whole seconds to wait. Returns null if the
 * message doesn't match this shape (e.g. Groq changes their error format),
 * so callers can fall back to manual-retry-only behavior instead of
 * guessing a wait time.
 */
export function parseRetryAfterSeconds(message: string): number | null {
  const match = RETRY_AFTER_PATTERN.exec(message)
  if (!match) return null
  const seconds = Number(match[1])
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null
}
