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

// A stroke-only gear/settings outline, 6-fold symmetry (each tooth a
// rectangular tab between the root and tip radius, joined by a root-radius
// arc through the valley). The earlier 8-tooth version used tooth walls only
// ~2.9 units apart at viewBox scale — with the shared 1.8 strokeWidth
// tracing both walls, the un-stroked gap between them shrank to ~1px at the
// rendered 20px size and anti-aliased away, so the whole cog painted as a
// solid blob instead of a thin outline, reading brighter/heavier than every
// other nav icon. This version has fewer, proportionally wider teeth (root
// chord ~3.6 units) so the stroked walls stay visually separated at 20px.
// Tip radius (8.8) still roughly matches Info/Clock's circle radius (8.5),
// and the center hole (r 3.4) is unchanged.
const GEAR_PATH =
  'M 10.21 5.96 L 9.5 3.56 L 14.5 3.56 L 13.79 5.96 A 6.3 6.3 0 0 1 16.34 7.43 L 18.06 5.62 L 20.56 9.95 L 18.13 10.53 A 6.3 6.3 0 0 1 18.13 13.47 L 20.56 14.05 L 18.06 18.38 L 16.34 16.57 A 6.3 6.3 0 0 1 13.79 18.04 L 14.5 20.44 L 9.5 20.44 L 10.21 18.04 A 6.3 6.3 0 0 1 7.66 16.57 L 5.94 18.38 L 3.44 14.05 L 5.87 13.47 A 6.3 6.3 0 0 1 5.87 10.53 L 3.44 9.95 L 5.94 5.62 L 7.66 7.43 A 6.3 6.3 0 0 1 10.21 5.96 Z'

export function GearIcon({ size = 20 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <path d={GEAR_PATH} />
      <circle cx="12" cy="12" r="3.4" />
    </svg>
  )
}
