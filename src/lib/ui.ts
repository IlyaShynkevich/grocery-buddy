import type { CSSProperties } from 'react'

/**
 * Shared style building blocks so "polished, consistent" doesn't mean
 * "copy-pasted inline style object into every page." Everything here reads
 * from the CSS custom properties in index.css (light/dark, grayscale-only —
 * no accent hue), so a page can't accidentally drift from the palette by
 * hardcoding a color.
 *
 * The same applies to size: `space` and the type styles below are the only
 * places a gap, a padding or a font size is chosen. A page picks a step off
 * the scale; it doesn't invent `0.35rem`.
 */

export const PAGE_MAX_WIDTH = 480

/**
 * The spacing scale, mirroring index.css's --space-* tokens (2 / 4 / 6 / 8 /
 * 12 / 16 / 20 / 24px). The CSS variables are the single definition; these
 * are just the names the inline style objects use to reach them.
 */
export const space = {
  '2xs': 'var(--space-2xs)',
  xs: 'var(--space-xs)',
  sm: 'var(--space-sm)',
  md: 'var(--space-md)',
  lg: 'var(--space-lg)',
  xl: 'var(--space-xl)',
  '2xl': 'var(--space-2xl)',
  '3xl': 'var(--space-3xl)',
} as const

/* ---------------------------------------------------------------- type --
 * Six steps. Hierarchy past that comes from weight (700 / 600 / 500 / 400)
 * and from the three text colour tiers (--text, --text-muted,
 * --text-subtle), not from adding sizes. index.css already applies
 * titleStyle/headingStyle to bare h1/h2 — these exist for the cases that
 * aren't a heading element, and for overriding one deliberately.
 */

/** The app wordmark on Home and About. Nothing else uses it. */
export const displayStyle: CSSProperties = {
  fontSize: 'var(--text-display)',
  fontWeight: 700,
  lineHeight: 1.15,
  letterSpacing: '-0.022em',
}

/** A page's <h1>. Matches index.css's h1 rule. */
export const titleStyle: CSSProperties = {
  fontSize: 'var(--text-title)',
  fontWeight: 700,
  lineHeight: 1.2,
  letterSpacing: '-0.021em',
}

/** A section heading inside a page. Matches index.css's h2 rule. */
export const headingStyle: CSSProperties = {
  fontSize: 'var(--text-heading)',
  fontWeight: 600,
  lineHeight: 1.3,
  letterSpacing: '-0.01em',
}

/** One step below body — dense list rows, where 16px would cost a screenful. */
export const calloutStyle: CSSProperties = {
  fontSize: 'var(--text-callout)',
  lineHeight: 1.4,
}

/** Hints, sub-labels, the second line of a row. */
export const footnoteStyle: CSSProperties = {
  fontSize: 'var(--text-footnote)',
  lineHeight: 1.35,
}

/** The quietest size — footer byline, version, fine print. */
export const captionStyle: CSSProperties = {
  fontSize: 'var(--text-caption)',
  lineHeight: 1.3,
}

/** Secondary text: present, but clearly not the thing being read first. */
export const mutedTextStyle: CSSProperties = {
  color: 'var(--text-muted)',
}

/** A third tier below muted, for text that's there only if looked for. */
export const subtleTextStyle: CSSProperties = {
  color: 'var(--text-subtle)',
}

/**
 * Fixed-width digits, so a column of prices lines up on the decimal instead
 * of shuffling sideways as the amounts change. Applied to money and byte
 * figures — never to running text, where proportional digits read better.
 */
export const numericStyle: CSSProperties = {
  fontVariantNumeric: 'tabular-nums',
}

/* --------------------------------------------------------------- layout */

export const pageStyle: CSSProperties = {
  // Explicit width (not just maxWidth) matters here: these sections are
  // flex items in App.tsx's column layout, and a flex item with auto
  // cross-axis margins (the `margin: '0 auto'` below) opts out of the
  // default stretch-to-container sizing, shrinking to its own content's
  // width instead — which made every page section a different width
  // depending on how wide its content happened to be. `width: '100%'`
  // gives it a definite size to stretch to before maxWidth clamps it.
  width: '100%',
  maxWidth: PAGE_MAX_WIDTH,
  margin: '0 auto',
  padding: space.xl,
  textAlign: 'left',
}

/* -------------------------------------------------------- card surfaces --
 * A card is a fill plus a hairline ring, not a 1px border: --shadow-card is
 * a 0.5px ring (and, in light mode, one soft shadow) drawn *outside* the
 * layout box. That reads quieter than a border and — because box-shadow
 * takes no space — it also gave back 2px of height per card, which is what
 * let the rest of this pass fit on pages that had 4–7px to spare.
 */

/** A raised panel — a settings group, a review/confirm panel, a stats block. */
export const cardStyle: CSSProperties = {
  background: 'var(--surface)',
  borderRadius: 'var(--radius-lg)',
  boxShadow: 'var(--shadow-card)',
  padding: `${space.lg} ${space.lg}`,
}

/**
 * A grouped list — one card containing rows divided by hairlines, the way
 * iOS's inset-grouped tables work, rather than a stack of separate cards
 * with gaps between them. Pair with `className="gb-group"` (index.css),
 * which draws the hairline between adjacent children, and `listRowStyle`
 * on each row. `overflow: hidden` is what clips the first and last rows to
 * the card's rounded corners.
 */
export const listGroupStyle: CSSProperties = {
  background: 'var(--surface)',
  borderRadius: 'var(--radius-lg)',
  boxShadow: 'var(--shadow-card)',
  overflow: 'hidden',
  listStyle: 'none',
  padding: 0,
  margin: 0,
}

/**
 * One row inside a `listGroupStyle` group. The 12px vertical padding is
 * what keeps a plain text row at a ~45px tap target; a row whose own
 * control is already that tall (a select, a text input) overrides it
 * downwards rather than stacking padding on top of it.
 */
export const listRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: space.md,
  padding: `${space.lg} ${space.lg}`,
  width: '100%',
  textAlign: 'left',
}

/* ------------------------------------------------------------- controls */

/** The main call-to-action on a page (Save trip, Add item, Confirm, ...). */
export const primaryButtonStyle: CSSProperties = {
  background: 'var(--accent)',
  color: 'var(--accent-contrast)',
  borderColor: 'var(--accent)',
  fontWeight: 600,
}

/** A quiet icon-only/utility button (✕ remove, etc.) — same footprint, less visual weight. */
export const iconButtonStyle: CSSProperties = {
  padding: `${space.sm} ${space.md}`,
  lineHeight: 1,
}

/** Destructive action, outlined until confirmed. */
export const dangerButtonStyle: CSSProperties = {
  color: 'var(--danger)',
  borderColor: 'var(--danger)',
}

/** Destructive action, filled — used for the final confirm step only. */
export const dangerFilledButtonStyle: CSSProperties = {
  background: 'var(--danger)',
  color: 'var(--danger-contrast)',
  borderColor: 'var(--danger)',
  fontWeight: 600,
}
