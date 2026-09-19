/**
 * Currencies a trip can be recorded in. The currency *setting* only decides
 * what new trips use (and a draft with no prices yet — see
 * syncDraftCurrency); every existing trip keeps the currency stored on it,
 * so changing the setting never relabels history.
 */
export type Currency = 'EUR' | 'BYN'

export const CURRENCIES: readonly Currency[] = ['EUR', 'BYN']

export const DEFAULT_CURRENCY: Currency = 'EUR'

export function isCurrency(value: unknown): value is Currency {
  return typeof value === 'string' && (CURRENCIES as readonly string[]).includes(value)
}
