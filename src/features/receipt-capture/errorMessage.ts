/**
 * Maps a raw extraction error (Groq's own error text, a parse failure, a
 * network error, etc.) to a short, human-readable message for display.
 * The raw error is still logged via console.error wherever it's caught —
 * this only changes what the user sees, never what gets logged.
 */
export function getUserFacingErrorMessage(rawMessage: string): string {
  if (/\b429\b/.test(rawMessage)) {
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
