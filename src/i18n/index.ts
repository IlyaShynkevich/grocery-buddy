import { en, type Messages } from './messages/en'
import { ru } from './messages/ru'
import { getLanguageConfig, useLanguageConfig } from '../settings/settingsStore'
import type { Language } from './languages'

const MESSAGES: Record<Language, Messages> = { en, ru }

/**
 * Messages for the active language, for code outside React (thrown errors,
 * data-layer validation). Read at call time — a message built now stays in
 * the language that was active when it was built.
 */
export function t(): Messages {
  return MESSAGES[getLanguageConfig().language]
}

/** Messages for the active language; re-renders the caller when it changes. */
export function useT(): Messages {
  return MESSAGES[useLanguageConfig().language]
}

/**
 * Display label for a category key (see db/categories.ts). The keys are the
 * stable identifiers stored on items; `Category.label` stays English on
 * purpose — it's what the extraction prompt shows the model.
 */
export function categoryLabel(messages: Messages, key: string): string {
  return Object.hasOwn(messages.categories, key)
    ? messages.categories[key as keyof Messages['categories']]
    : messages.categories.other
}
