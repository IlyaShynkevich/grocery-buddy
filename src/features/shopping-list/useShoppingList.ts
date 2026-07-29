import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { ACTIVE_TRIP_KEY, db, getOrCreateActiveTrip, newItem } from '../../db/db'

export function useShoppingList() {
  // Reactive: re-fires whenever appState.activeTripId changes, including
  // from outside this hook (e.g. the debug panel's reset or "make active").
  const pointerRow = useLiveQuery(() => db.appState.get(ACTIVE_TRIP_KEY), [])
  const pointerTripId = typeof pointerRow?.value === 'number' ? pointerRow.value : undefined

  const [tripId, setTripId] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false

    async function resolve() {
      if (pointerTripId !== undefined) {
        const pinned = await db.trips.get(pointerTripId)
        if (pinned && pinned.status === 'draft') {
          if (!cancelled) setTripId(pinned.id)
          return
        }
      }

      // Pointer missing or stale (e.g. the pinned trip was just deleted by
      // a reset) — resolve and persist a valid one rather than continuing
      // to write against a trip id that no longer exists.
      const trip = await getOrCreateActiveTrip()
      if (!cancelled) setTripId(trip.id)
    }

    resolve()
    return () => {
      cancelled = true
    }
  }, [pointerTripId])

  const trip = useLiveQuery(() => (tripId ? db.trips.get(tripId) : undefined), [tripId])

  const items = useLiveQuery(
    () => (tripId ? db.items.where('tripId').equals(tripId).sortBy('id') : []),
    [tripId],
    [],
  )

  const addItem = async (name: string) => {
    const trimmed = name.trim()
    if (!tripId || !trimmed) return
    await db.items.add(newItem(tripId, { name: trimmed }))
  }

  const renameItem = async (itemId: number, name: string) => {
    await db.items.update(itemId, { name })
  }

  const removeItem = async (itemId: number) => {
    await db.items.delete(itemId)
  }

  return { trip, items: items ?? [], addItem, renameItem, removeItem }
}
