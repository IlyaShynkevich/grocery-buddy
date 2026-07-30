import type { CSSProperties } from 'react'

/**
 * Shared style building blocks so "polished, consistent" doesn't mean
 * "copy-pasted inline style object into every page." Everything here reads
 * from the CSS custom properties in index.css (light/dark, grayscale-only —
 * no accent hue), so a page can't accidentally drift from the palette by
 * hardcoding a color.
 */

export const PAGE_MAX_WIDTH = 480

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
  padding: '1rem',
  textAlign: 'left',
}

/** A raised panel — list rows, review/confirm panels, anything that should read as a distinct group. */
export const cardStyle: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  padding: '0.6rem 0.75rem',
}

export const mutedTextStyle: CSSProperties = {
  color: 'var(--text-muted)',
}

/** The main call-to-action on a page (Save trip, Add item, Confirm, ...). */
export const primaryButtonStyle: CSSProperties = {
  background: 'var(--accent)',
  color: 'var(--accent-contrast)',
  borderColor: 'var(--accent)',
  fontWeight: 600,
}

/** A quiet icon-only/utility button (✕ remove, etc.) — same footprint, less visual weight. */
export const iconButtonStyle: CSSProperties = {
  padding: '0.4rem 0.6rem',
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
