const dateFormatter = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

const monthFormatter = new Intl.DateTimeFormat('de-DE', {
  month: 'long',
  year: 'numeric',
})

/**
 * Formats a Trip's `date` (a plain 'YYYY-MM-DD' string, no time/timezone —
 * see newTrip()) as German-locale DD.MM.YYYY, e.g. "30.07.2026". Parses the
 * parts manually rather than `new Date(isoDate)`: that parses as UTC
 * midnight, which can display as the previous day in negative-UTC-offset
 * timezones — this app has no time component to lose, so building a local
 * midnight Date instead sidesteps the shift entirely.
 */
export function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  return dateFormatter.format(new Date(year, month - 1, day))
}

/** Key for grouping a Trip's `date` by calendar month, e.g. '2026-07'. */
export function monthKey(isoDate: string): string {
  return isoDate.slice(0, 7)
}

/**
 * Formats a month key ('YYYY-MM', see monthKey) as German-locale "Month
 * YYYY", e.g. "Juli 2026". Same local-midnight construction as formatDate,
 * for the same timezone-shift reason.
 */
export function formatMonth(key: string): string {
  const [year, month] = key.split('-').map(Number)
  return monthFormatter.format(new Date(year, month - 1, 1))
}
