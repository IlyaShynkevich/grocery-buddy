import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Trip } from '../../db/db'
import { formatMonth, monthKey } from '../../lib/formatDate'

export interface CompletedTripSummary extends Trip {
  itemCount: number
}

export interface MonthGroup {
  /** 'YYYY-MM', see monthKey */
  key: string
  label: string
  trips: CompletedTripSummary[]
}

/** Completed trips, most recently completed first — the foundation M7/M8 build stats on top of. */
export function useHistory(): CompletedTripSummary[] {
  const trips = useLiveQuery(async () => {
    const completed = await db.trips.where('status').equals('complete').toArray()
    completed.sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
    return Promise.all(
      completed.map(async (trip) => {
        const itemCount = await db.items
          .where('tripId')
          .equals(trip.id)
          .filter((item) => !item.isDiscount)
          .count()
        return { ...trip, itemCount }
      }),
    )
  }, [])

  return trips ?? []
}

/**
 * Groups already-sorted (most-recently-completed-first) trips by the
 * calendar month of their shopping date, most recent month first. Trips
 * within a group keep the incoming order, so they stay sorted most-recent-
 * completed-first too.
 */
export function groupTripsByMonth(trips: CompletedTripSummary[]): MonthGroup[] {
  const byKey = new Map<string, CompletedTripSummary[]>()
  for (const trip of trips) {
    const key = monthKey(trip.date)
    const group = byKey.get(key)
    if (group) group.push(trip)
    else byKey.set(key, [trip])
  }

  return Array.from(byKey.entries())
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([key, groupTrips]) => ({ key, label: formatMonth(key), trips: groupTrips }))
}
