const currencyFormatter = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
})

/**
 * Formats an amount as German-locale EUR (e.g. "3,49 €", "1.234,56 €") —
 * comma decimal separator, period thousands separator, symbol after the
 * amount. The single place this app formats a price, so M5+ doesn't need
 * to repeat it.
 */
export function formatPrice(amount: number | null): string {
  if (amount === null) return '—'
  return currencyFormatter.format(amount)
}
