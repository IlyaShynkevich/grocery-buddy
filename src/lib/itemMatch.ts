// Combining diacritical marks (U+0300–U+036F), stripped after NFD
// decomposition so accented letters compare on their base character.
const DIACRITICS_PATTERN = /[̀-ͯ]/g

function normalize(name: string): string {
  return name.toLowerCase().normalize('NFD').replace(DIACRITICS_PATTERN, '').trim()
}

function tokenize(name: string): string[] {
  return normalize(name).split(/\s+/).filter(Boolean)
}

function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0))
  for (let i = 0; i <= a.length; i++) dp[i][0] = i
  for (let j = 0; j <= b.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1])
    }
  }
  return dp[a.length][b.length]
}

function closeEnough(a: string, b: string): boolean {
  if (!a || !b) return false
  if (a === b || a.includes(b) || b.includes(a)) return true
  // Below 4 characters, an edit distance of 1-2 covers most unrelated word
  // pairs too ("tea" vs "steak") — only trust the fuzzy fallback once both
  // sides have enough length for it to mean something.
  if (Math.min(a.length, b.length) < 4) return false
  return levenshtein(a, b) / Math.max(a.length, b.length) <= 0.4
}

/**
 * Best-effort match between a typed item name and a receipt-extracted item
 * name, used to suggest (never auto-apply) a merge in the review panel.
 * Tries the full normalized strings first (exact/substring/edit-distance),
 * then falls back to comparing individual words — receipt lines often carry
 * extra detail appended to the core product name ("Milch 1L 3,5%"), which
 * would otherwise sink a whole-string distance check even though "milk"
 * clearly matches "Milch". Intentionally simple: this only ever produces a
 * suggestion the user confirms, so a false positive is a one-tap dismissal
 * and a false negative just leaves the two entries side by side, same as if
 * no matching existed at all.
 */
export function isLikelyMatch(nameA: string, nameB: string): boolean {
  const a = normalize(nameA)
  const b = normalize(nameB)
  if (closeEnough(a, b)) return true

  const tokensA = tokenize(a)
  const tokensB = tokenize(b)
  return tokensA.some((tokenA) => tokensB.some((tokenB) => closeEnough(tokenA, tokenB)))
}
