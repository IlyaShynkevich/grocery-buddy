import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { ACTIVE_TRIP_KEY, db, getOrCreateActiveTrip, refreshDraftDate } from '../../db/db'

/**
 * Resolves the id of the trip currently being shopped, reactively.
 *
 * Shared by every feature that needs to attach data to "the current trip"
 * (typed items, receipt captures, ...): identity comes from the persisted
 * appState pointer, never from a heuristic like "latest draft" — see the
 * getOrCreateActiveTrip doc comment for why that heuristic caused a bug
 * during M2. Keeping this resolution in one place means M3+ features can't
 * quietly reintroduce a divergent, buggier copy of the same logic.
 */
export function useActiveTripId(): number | null {
  const pointerRow = useLiveQuery(() => db.appState.get(ACTIVE_TRIP_KEY), [])
  const pointerTripId = typeof pointerRow?.value === 'number' ? pointerRow.value : undefined

  const [tripId, setTripId] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false

    async function resolve() {
      if (pointerTripId !== undefined) {
        const pinned = await db.trips.get(pointerTripId)
        if (pinned && pinned.status === 'draft') {
          // Refreshes the trip's date to today if it's gone stale (e.g. the
          // app was left open, or reopened, on a later day than the draft
          // was created) — trip.date is read reactively elsewhere via
          // Dexie live queries, so this DB write alone is enough for the
          // displayed date to update without waiting for a new trip.
          const refreshed = await refreshDraftDate(pinned)
          if (!cancelled) setTripId(refreshed.id)
          return
        }
      }

      const trip = await getOrCreateActiveTrip()
      if (!cancelled) setTripId(trip.id)
    }

    resolve()
    return () => {
      cancelled = true
    }
  }, [pointerTripId])

  return tripId
}
