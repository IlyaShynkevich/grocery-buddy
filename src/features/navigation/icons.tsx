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

const GEAR_TOOTH_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315]

export function GearIcon({ size = 20 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <circle cx="12" cy="12" r="5.5" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      {GEAR_TOOTH_ANGLES.map((deg) => (
        <rect key={deg} x="10.7" y="1.4" width="2.6" height="3" rx="0.9" transform={`rotate(${deg} 12 12)`} />
      ))}
    </svg>
  )
}
