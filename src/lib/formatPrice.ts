import type { Currency } from '../i18n/currencies'
import { getLanguageConfig } from '../settings/settingsStore'

const formatters = new Map<string, Intl.NumberFormat>()

/**
 * Formats an amount in `currency` using the active language's number
 * conventions — e.g. "3,49 €" in English (German separators, as the app has
 * always shown prices). The currency is the amount's own, never the
 * currency setting: changing a setting must not relabel what a price was
 * paid in. The single place this app formats a price.
 */
export function formatPrice(amount: number | null, currency: Currency = 'EUR'): string {
  if (amount === null) return '—'
  const locale = getLanguageConfig().numberLocale
  const key = `${locale}|${currency}`
  let formatter = formatters.get(key)
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, { style: 'currency', currency })
    formatters.set(key, formatter)
  }
  return formatter.format(amount)
}
