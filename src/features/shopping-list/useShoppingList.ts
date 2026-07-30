import { useLiveQuery } from 'dexie-react-hooks'
import { completeTrip, db, newItem } from '../../db/db'
import { useActiveTripId } from '../trip/useActiveTripId'

export function useShoppingList() {
  const tripId = useActiveTripId()

  const trip = useLiveQuery(() => (tripId ? db.trips.get(tripId) : undefined), [tripId])

  // Discount/coupon lines are counted in the trip total (recomputeTripTotal
  // sums every item's price) but aren't purchasable products, so they're
  // excluded here rather than shown as something to buy again.
  const items = useLiveQuery(
    () =>
      tripId
        ? db.items
            .where('tripId')
            .equals(tripId)
            .sortBy('id')
            .then((all) => all.filter((item) => !item.isDiscount))
        : [],
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

  const saveTrip = async () => {
    if (!tripId) return
    await completeTrip(tripId)
  }

  return { trip, items: items ?? [], addItem, renameItem, removeItem, saveTrip }
}
