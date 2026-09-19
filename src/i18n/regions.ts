/**
 * A "region" is one language + its formatting conventions + the currency
 * new trips are recorded in. Kept as a small fixed set rather than free
 * language/currency pickers: each combination is a deliberate, tested
 * configuration.
 */
export type Currency = 'EUR'

export type Language = 'en'

export interface Region {
  id: RegionId
  language: Language
  /** `<html lang>` */
  htmlLang: string
  /** Prices (decimal/grouping separators, symbol placement). */
  numberLocale: string
  /** Numeric dates (DD.MM.YYYY). */
  dateLocale: string
  /** Month names ("July 2026"). */
  monthLocale: string
  /** Currency new trips are recorded in. Existing trips keep their own. */
  currency: Currency
}

export type RegionId = 'en-EUR'

export const REGIONS: Record<RegionId, Region> = {
  // German number/date formatting (3,49 € / 30.07.2026) — how the app has
  // always shown prices and dates — with English month names ("July 2026",
  // previously German "Juli 2026", a leftover of the same German default).
  'en-EUR': {
    id: 'en-EUR',
    language: 'en',
    htmlLang: 'en',
    numberLocale: 'de-DE',
    dateLocale: 'de-DE',
    monthLocale: 'en-GB',
    currency: 'EUR',
  },
}

export const DEFAULT_REGION_ID: RegionId = 'en-EUR'

export function isRegionId(value: unknown): value is RegionId {
  return typeof value === 'string' && Object.hasOwn(REGIONS, value)
}
