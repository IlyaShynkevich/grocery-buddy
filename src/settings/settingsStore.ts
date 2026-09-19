import { useSyncExternalStore } from 'react'
import { CURRENCIES, DEFAULT_CURRENCY, isCurrency, type Currency } from '../i18n/currencies'
import { DEFAULT_LANGUAGE, isLanguage, LANGUAGES, type Language, type LanguageConfig } from '../i18n/languages'

/**
 * The app's device settings, each persisted independently in localStorage —
 * read synchronously so the first render is already right (no flash of the
 * wrong language), and readable by the standalone login page. Deliberately
 * not in IndexedDB/backups: they're device preferences; the data that
 * depends on them (each trip's currency) is stored on the trip itself.
 */
export interface Settings {
  language: Language
  /** What new trips are recorded in — never applied to existing trips. */
  currency: Currency
}

export const SETTINGS_KEYS = {
  language: 'grocery-buddy:language',
  currency: 'grocery-buddy:currency',
} as const

/**
 * The old combined setting ('en-EUR' | 'ru-BYN'), from before language and
 * currency were independent. Migrated on load (see load()); the login page
 * still falls back to it in case it loads before the app has migrated.
 */
export const LEGACY_REGION_KEY = 'grocery-buddy:region'
const LEGACY_REGIONS: Record<string, Settings> = {
  'en-EUR': { language: 'en', currency: 'EUR' },
  'ru-BYN': { language: 'ru', currency: 'BYN' },
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch (err) {
    console.error(`Grocery Buddy: could not read the saved setting ${key} — using the default`, err)
    return null
  }
}

function load(): Settings {
  const storedLanguage = read(SETTINGS_KEYS.language)
  const storedCurrency = read(SETTINGS_KEYS.currency)
  const legacyValue = read(LEGACY_REGION_KEY)

  let legacy: Settings | undefined
  if (legacyValue !== null) {
    legacy = LEGACY_REGIONS[legacyValue]
    if (!legacy) console.error(`Grocery Buddy: unknown saved region ${JSON.stringify(legacyValue)} — ignoring it`)
  }

  const pick = <T>(stored: string | null, valid: (v: unknown) => v is T, fallback: T, name: string): T => {
    if (stored === null) return fallback
    if (valid(stored)) return stored
    console.error(`Grocery Buddy: unknown saved ${name} ${JSON.stringify(stored)} — using the default`)
    return fallback
  }
  const settings: Settings = {
    language: pick(storedLanguage, isLanguage, legacy?.language ?? DEFAULT_LANGUAGE, 'language'),
    currency: pick(storedCurrency, isCurrency, legacy?.currency ?? DEFAULT_CURRENCY, 'currency'),
  }

  // One-time migration of the old combined setting: write the split values
  // first and only then remove the old key, so a failure part-way leaves it
  // in place to retry on the next load.
  if (legacyValue !== null) {
    try {
      localStorage.setItem(SETTINGS_KEYS.language, settings.language)
      localStorage.setItem(SETTINGS_KEYS.currency, settings.currency)
      localStorage.removeItem(LEGACY_REGION_KEY)
    } catch (err) {
      console.error('Grocery Buddy: could not migrate the old region setting — using it for this session, will retry', err)
    }
  }
  return settings
}

let current: Settings = load()
const listeners = new Set<() => void>()

function applyToDocument(settings: Settings) {
  document.documentElement.lang = LANGUAGES[settings.language].htmlLang
}
applyToDocument(current)

/**
 * Applies `changes` immediately, then persists them. If persisting fails the
 * change still applies for this session and the error is rethrown, so the
 * caller can say it won't survive a reload.
 */
function update(changes: Partial<Settings>) {
  current = { ...current, ...changes }
  applyToDocument(current)
  listeners.forEach((listener) => listener())
  for (const [key, value] of Object.entries(changes) as [keyof Settings, string][]) {
    localStorage.setItem(SETTINGS_KEYS[key], value)
  }
}

export function setLanguage(language: Language): void {
  update({ language })
}

export function setCurrency(currency: Currency): void {
  update({ currency })
}

export function getSettings(): Settings {
  return current
}

export function getLanguageConfig(): LanguageConfig {
  return LANGUAGES[current.language]
}

export function getCurrency(): Currency {
  return current.currency
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** All settings; re-renders the caller when any changes. */
export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, getSettings)
}

/** Re-renders only when the language changes. */
export function useLanguageConfig(): LanguageConfig {
  return useSyncExternalStore(subscribe, getLanguageConfig)
}

/** Re-renders only when the currency setting changes. */
export function useCurrencySetting(): Currency {
  return useSyncExternalStore(subscribe, getCurrency)
}

export { CURRENCIES, LANGUAGES }
