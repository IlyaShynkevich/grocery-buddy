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
  /** Sum of non-discount item prices whose resolved status is essential/non-essential. */
  essential: number
  nonEssential: number
  /** Non-discount item prices summed per category, sorted by amount descending. */
  categories: CategoryStat[]
}

/** Same months History groups trips into — the selector for Stats reuses this directly. */
export function useStatsMonths(): MonthGroup[] {
  const trips = useHistory()
  return groupTripsByMonth(trips)
}

/**
 * Stats for one month's completed trips. Discount/coupon lines are excluded
 * from the essential and category breakdowns (they're deductions, not
 * purchases) but the month total still nets them out, via each trip's
 * already-discounted `total` — same convention as History/trip detail.
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
    if (item.isDiscount) continue
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
