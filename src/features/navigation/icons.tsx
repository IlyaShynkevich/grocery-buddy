import type { CSSProperties } from 'react'

/**
 * Small line-icon set for the nav bar (corner icons + the 4 middle tabs).
 * Hand-drawn inline SVGs, not an icon library dependency — consistent with
 * the rest of the app (plain React + inline styles, zero UI deps). Stroke-
 * only, `currentColor`, so each button's existing active/inactive color
 * logic (background + text color swap) colors the icon for free with no
 * extra prop needed.
 */

export interface IconProps {
  size?: number
}

const BASE_STYLE: CSSProperties = { display: 'block' }

function svgProps(size: number) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none' as const,
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    style: BASE_STYLE,
    'aria-hidden': true,
  }
}

export function HomeIcon({ size = 20 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="M4 11.5 12 4l8 7.5" />
      <path d="M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9" />
      <path d="M10 20v-6h4v6" />
    </svg>
  )
}

export function InfoIcon({ size = 20 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <circle cx="12" cy="12" r="8.5" />
      <line x1="12" y1="11" x2="12" y2="16.5" />
      <circle cx="12" cy="7.5" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function ShoppingBagIcon({ size = 20 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
      <path d="M6 8h12l-1 12.5a1.5 1.5 0 0 1-1.5 1.5H8.5A1.5 1.5 0 0 1 7 20.5L6 8Z" />
    </svg>
  )
}

export function ClockIcon({ size = 20 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v5l3.5 2" />
    </svg>
  )
}

export function BarChartIcon({ size = 20 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <line x1="5" y1="20" x2="5" y2="12.5" />
      <line x1="12" y1="20" x2="12" y2="6" />
      <line x1="19" y1="20" x2="19" y2="15.5" />
    </svg>
  )
}

// Adapted from the reference gear/settings icon at ICONS/gear-icon.png (a
// filled cog-with-hole glyph) into this set's stroke-only style: one
// continuous outline path — 8 teeth joined directly to a circular root, via
// arcs for the valleys between teeth — plus a plain stroked circle for the
// center hole, instead of that reference's filled silhouette. Being a single
// path (not separate overlapping shapes, which is what earlier hand-drawn
// attempts used) is what makes strokeLinejoin: round (set globally in
// svgProps) soften every tooth corner for free, matching the reference's
// rounded-tooth look, and it's also what avoids any gap/seam between teeth
// and body — the failure mode of those earlier attempts. Coordinates were
// generated with a small script (8-fold symmetry: each tooth is a trapezoid
// between the root radius and the tip radius, joined by a root-radius arc
// through the valley) rather than hand-typed, so the teeth are exactly
// evenly spaced. Sized so the tip radius (~8.3) roughly matches Info/Clock's
// circle radius (8.5), and the center hole (r 3.4) is proportioned like the
// reference's.
const GEAR_PATH =
  'M 10.55 6.59 L 10.56 3.83 L 13.44 3.83 L 13.45 6.59 A 5.6 5.6 0 0 1 14.8 7.15 L 16.76 5.2 L 18.8 7.24 L 16.85 9.2 A 5.6 5.6 0 0 1 17.41 10.55 L 20.17 10.56 L 20.17 13.44 L 17.41 13.45 A 5.6 5.6 0 0 1 16.85 14.8 L 18.8 16.76 L 16.76 18.8 L 14.8 16.85 A 5.6 5.6 0 0 1 13.45 17.41 L 13.44 20.17 L 10.56 20.17 L 10.55 17.41 A 5.6 5.6 0 0 1 9.2 16.85 L 7.24 18.8 L 5.2 16.76 L 7.15 14.8 A 5.6 5.6 0 0 1 6.59 13.45 L 3.83 13.44 L 3.83 10.56 L 6.59 10.55 A 5.6 5.6 0 0 1 7.15 9.2 L 5.2 7.24 L 7.24 5.2 L 9.2 7.15 A 5.6 5.6 0 0 1 10.55 6.59 Z'

export function GearIcon({ size = 20 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <path d={GEAR_PATH} />
      <circle cx="12" cy="12" r="3.4" />
    </svg>
  )
}
