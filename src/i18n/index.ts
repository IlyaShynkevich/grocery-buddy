import { en, type Messages } from './messages/en'
import { getRegion, useRegion } from './regionStore'
import type { Language } from './regions'

const MESSAGES: Record<Language, Messages> = { en }

/**
 * Messages for the active region, for code outside React (thrown errors,
 * data-layer validation). Read at call time — a message built now stays in
 * the language that was active when it was built.
 */
export function t(): Messages {
  return MESSAGES[getRegion().language]
}

/** Messages for the active region; re-renders the caller when the region changes. */
export function useT(): Messages {
  return MESSAGES[useRegion().language]
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
