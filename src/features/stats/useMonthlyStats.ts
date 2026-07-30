import { useLiveQuery } from 'dexie-react-hooks'
import { getCategory, resolveEssential } from '../../db/categories'
import { db, type Item } from '../../db/db'
import { groupTripsByMonth, useHistory, type MonthGroup } from '../history/useHistory'

export interface CategoryStat {
  key: string
  label: string
  amount: number
}

export interface MonthlyStats {
  /** Sum of each trip's total (already net of discounts, same as History/trip detail). */
  total: number
  /**
   * Sum of item prices whose resolved status is essential/non-essential.
   * Discount/coupon lines are included here (see useMonthlyStats) so this
   * always sums to `total`, not just the gross purchase amount.
   */
  essential: number
  nonEssential: number
  /**
   * Item prices summed per category, sorted by amount descending. Includes
   * discount/coupon lines under their own recorded category (see
   * useMonthlyStats), so this always sums to `total` too.
   */
  categories: CategoryStat[]
}

/** Same months History groups trips into — the selector for Stats reuses this directly. */
export function useStatsMonths(): MonthGroup[] {
  const trips = useHistory()
  return groupTripsByMonth(trips)
}

/**
 * Stats for one month's completed trips. `total` is the sum of each trip's
 * already-discount-net `total` (same convention as History/trip detail), so
 * essential/non-essential and the category breakdown must also account for
 * discounts to reconcile with it — otherwise Essential + Non-essential (and
 * the category totals) would sum to the *gross* purchase amount instead of
 * the displayed Total, which is a real bug we've hit in production.
 *
 * A discount/coupon line has no reliable link back to which purchased item
 * it discounted — the receipt extraction prompt just tags every discount
 * with category "other" (see api/_lib/groqExtract.ts) rather than the
 * category of whatever it discounted. Rather than guess a distribution
 * across categories, each discount's (negative) amount is folded into its
 * own recorded category and resolved essential status, exactly like any
 * other item. In practice that means discounts land under "Other" (which
 * defaults to essential — see CATEGORIES in src/db/categories.ts), i.e.
 * they reduce the essential total by default. This keeps both breakdowns
 * exactly reconciled with `total` without inventing a fake category link.
 */
export function useMonthlyStats(group: MonthGroup | undefined): MonthlyStats | null {
  const tripIds = group?.trips.map((trip) => trip.id) ?? []
  const tripIdsKey = tripIds.join(',')

  const items = useLiveQuery<Item[], Item[]>(
    () => (tripIds.length ? db.items.where('tripId').anyOf(tripIds).toArray() : Promise.resolve([])),
    [tripIdsKey],
    [],
  )

  if (!group || group.trips.length === 0) return null

  const total = group.trips.reduce((sum, trip) => sum + trip.total, 0)

  let essential = 0
  let nonEssential = 0
  const byCategory = new Map<string, number>()

  for (const item of items) {
    const amount = item.price ?? 0
    if (resolveEssential(item)) essential += amount
    else nonEssential += amount
    byCategory.set(item.category, (byCategory.get(item.category) ?? 0) + amount)
  }

  const categories: CategoryStat[] = Array.from(byCategory.entries())
    .map(([key, amount]) => ({ key, label: getCategory(key).label, amount }))
    .sort((a, b) => b.amount - a.amount)

  return { total, essential, nonEssential, categories }
}
