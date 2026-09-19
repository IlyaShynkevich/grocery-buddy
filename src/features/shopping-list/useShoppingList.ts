import { useLiveQuery } from 'dexie-react-hooks'
import { completeTrip, db, getOrCreateActiveTrip, newItem } from '../../db/db'
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

  // Receipts on this trip whose photo hasn't been turned into items yet
  // (never processed, mid-processing, or failed). Save trip is blocked while
  // any exist: saving would leave them attached to a trip that's no longer
  // shown anywhere — never processed, never reviewed, never deleted.
  const unprocessedReceiptCount = useLiveQuery(
    () =>
      tripId
        ? db.pendingReceipts
            .where('tripId')
            .equals(tripId)
            .filter((receipt) => receipt.status !== 'done')
            .count()
        : 0,
    [tripId],
    0,
  )

  // Resolves the active trip itself rather than trusting `tripId` above,
  // same as captureReceipt: the form is usable before that has loaded, and
  // returning early when it hadn't silently dropped the item (the input
  // still cleared) — easy to hit on a slow phone right after opening.
  const addItem = async (name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    const trip = await getOrCreateActiveTrip()
    await db.items.add(newItem(trip.id, { name: trimmed }))
  }

  const renameItem = async (itemId: number, name: string) => {
    await db.items.update(itemId, { name })
  }

  const removeItem = async (itemId: number) => {
    await db.items.delete(itemId)
  }

  const toggleItemChecked = async (itemId: number, checked: boolean) => {
    await db.items.update(itemId, { checked })
  }

  const saveTrip = async () => {
    if (!tripId) return
    await completeTrip(tripId)
  }

  return { trip, items: items ?? [], unprocessedReceiptCount, addItem, renameItem, removeItem, toggleItemChecked, saveTrip }
}
