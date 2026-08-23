import type { CSSProperties } from 'react'

const CHIP_SIZE = 22
const ICON_SIZE = 13

// The icon art itself is a flat white outline on a transparent background
// (public/icons/*.png) — it needs a dark backdrop to read at all. A fixed
// dark tone (not var(--accent), which flips to a *light* gray in dark mode)
// keeps that contrast in both themes, since the icon's own pixels never
// invert with the theme.
const chipStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: CHIP_SIZE,
  height: CHIP_SIZE,
  borderRadius: '50%',
  background: '#3f3f46',
  flexShrink: 0,
}

export function IconChip({ src, alt = '' }: { src: string; alt?: string }) {
  return (
    <span style={chipStyle}>
      <img src={src} alt={alt} width={ICON_SIZE} height={ICON_SIZE} style={{ display: 'block' }} />
    </span>
  )
}
