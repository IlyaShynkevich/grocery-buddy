/**
 * The UI languages, each with the formatting conventions that come with it.
 * Formatting follows the language, never the currency — separators and
 * date order are a reading habit ("1 234,50 €" in Russian, "1.234,50 BYN" in
 * English). Which currency a price is in comes from its trip, and which
 * currency new trips use is a separate setting (see currencies.ts).
 */
export type Language = 'en' | 'ru'

export interface LanguageConfig {
  language: Language
  /** Shown in the picker, always in the language itself. */
  label: string
  /** `<html lang>` */
  htmlLang: string
  /** Prices (decimal/grouping separators, symbol placement). */
  numberLocale: string
  /** Numeric dates (DD.MM.YYYY). */
  dateLocale: string
  /** Month names ("July 2026"). */
  monthLocale: string
}

export const LANGUAGES: Record<Language, LanguageConfig> = {
  // German number/date formatting (3,49 € / 30.07.2026) — how the app has
  // always shown prices and dates — with English month names. A BYN price
  // shows as "3,49 BYN": German formatting has no BYN symbol, and its only
  // alternative ("р.") would be confusable with Russian roubles.
  en: {
    language: 'en',
    label: 'English',
    htmlLang: 'en',
    numberLocale: 'de-DE',
    dateLocale: 'de-DE',
    monthLocale: 'en-GB',
  },
  // ru-BY (not ru-RU): it's the locale whose BYN symbol is "Br"; ru-RU
  // prints the bare code. Dates are DD.MM.YYYY too.
  ru: {
    language: 'ru',
    label: 'Русский',
    htmlLang: 'ru',
    numberLocale: 'ru-BY',
    dateLocale: 'ru-BY',
    monthLocale: 'ru-BY',
  },
}

export const DEFAULT_LANGUAGE: Language = 'en'

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && Object.hasOwn(LANGUAGES, value)
}
