import { useLiveQuery } from 'dexie-react-hooks'
import { db, newItem } from '../../db/db'
import { useActiveTripId } from '../trip/useActiveTripId'

export function useShoppingList() {
  const tripId = useActiveTripId()

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
