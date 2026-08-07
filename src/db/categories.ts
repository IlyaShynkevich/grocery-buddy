export interface Category {
  key: string
  label: string
  essential: boolean
}

export const CATEGORIES: Category[] = [
  { key: 'produce', label: 'Produce', essential: true },
  { key: 'dairy', label: 'Dairy', essential: true },
  { key: 'meat_seafood', label: 'Meat & Seafood', essential: true },
  { key: 'bakery', label: 'Bakery', essential: true },
  { key: 'frozen', label: 'Frozen', essential: true },
  { key: 'pantry', label: 'Pantry / Dry Goods', essential: true },
  { key: 'household', label: 'Household', essential: true },
  { key: 'personal_care', label: 'Personal Care', essential: true },
  { key: 'snacks', label: 'Snacks', essential: false },
  { key: 'drinks', label: 'Drinks', essential: false },
  { key: 'other', label: 'Other', essential: true },
]

const CATEGORY_BY_KEY = new Map(CATEGORIES.map((category) => [category.key, category]))

export const DEFAULT_CATEGORY_KEY = 'other'

export function getCategory(key: string): Category {
  return CATEGORY_BY_KEY.get(key) ?? CATEGORY_BY_KEY.get(DEFAULT_CATEGORY_KEY)!
}

export function isEssentialByDefault(categoryKey: string): boolean {
  return getCategory(categoryKey).essential
}

/**
 * An item's effective essential/non-essential status: the category's default,
 * unless the user has explicitly overridden it for that item. `essentialOverride`
 * (when non-null) is the item's literal resulting status, not a flip/delta
 * relative to the category default — every writer of this field (the manual
 * debug-panel toggle, the AI extraction path) must set it that way.
 */
export function resolveEssential(item: {
  category: string
  essentialOverride: boolean | null
}): boolean {
  return item.essentialOverride ?? isEssentialByDefault(item.category)
}
