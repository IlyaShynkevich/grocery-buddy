import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Trip } from '../../db/db'

export interface CompletedTripSummary extends Trip {
  itemCount: number
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
