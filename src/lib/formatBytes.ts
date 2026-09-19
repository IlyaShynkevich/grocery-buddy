import { getLanguageConfig } from '../settings/settingsStore'

// Decimal (1 kB = 1000 B), which is what the "kB/MB/GB" labels Intl prints mean.
const UNITS = [
  { unit: 'gigabyte', size: 1e9 },
  { unit: 'megabyte', size: 1e6 },
  { unit: 'kilobyte', size: 1e3 },
] as const

/** A byte count in the active language's number style — "1,4 MB", "1,4 МБ". */
export function formatBytes(bytes: number): string {
  const locale = getLanguageConfig().numberLocale
  const match = UNITS.find(({ size }) => bytes >= size)
  const [value, unit] = match ? [bytes / match.size, match.unit] : [bytes, 'byte']
  return new Intl.NumberFormat(locale, { style: 'unit', unit, unitDisplay: 'short', maximumFractionDigits: 1 }).format(value)
}
