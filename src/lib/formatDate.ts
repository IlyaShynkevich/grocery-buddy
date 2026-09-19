import { getLanguageConfig } from '../settings/settingsStore'

const formatters = new Map<string, Intl.DateTimeFormat>()

function formatter(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`
  let cached = formatters.get(key)
  if (!cached) {
    cached = new Intl.DateTimeFormat(locale, options)
    formatters.set(key, cached)
  }
  return cached
}

/**
 * Formats a Trip's `date` (a plain 'YYYY-MM-DD' string, no time/timezone —
 * see newTrip()) as DD.MM.YYYY, e.g. "30.07.2026", per the active language.
 * Parses the parts manually rather than `new Date(isoDate)`: that parses as
 * UTC midnight, which can display as the previous day in negative-UTC-offset
 * timezones — this app has no time component to lose, so building a local
 * midnight Date instead sidesteps the shift entirely.
 */
export function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  return formatter(getLanguageConfig().dateLocale, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(
    new Date(year, month - 1, day),
  )
}

/** A timestamp (epoch ms) as date + time in the active language, e.g. "30.07.2026, 14:32". */
export function formatDateTime(epochMs: number): string {
  return formatter(getLanguageConfig().dateLocale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(epochMs))
}

/** Key for grouping a Trip's `date` by calendar month, e.g. '2026-07'. */
export function monthKey(isoDate: string): string {
  return isoDate.slice(0, 7)
}

/**
 * Formats a month key ('YYYY-MM', see monthKey) as "Month YYYY" in the
 * active language, e.g. "July 2026". Capitalized, since it's used as a
 * heading/label and some languages write month names lowercase. Same
 * local-midnight construction as formatDate, for the same timezone reason.
 */
export function formatMonth(key: string): string {
  const [year, month] = key.split('-').map(Number)
  const { monthLocale } = getLanguageConfig()
  const label = formatter(monthLocale, { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1))
  return label.charAt(0).toLocaleUpperCase(monthLocale) + label.slice(1)
}
