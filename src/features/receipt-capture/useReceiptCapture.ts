import { useLiveQuery } from 'dexie-react-hooks'
import { db, getOrCreateActiveTrip } from '../../db/db'
import { useActiveTripId } from '../trip/useActiveTripId'

export function useReceiptCapture() {
  const tripId = useActiveTripId()

  const pendingReceipts = useLiveQuery(
    () =>
      tripId
        ? db.pendingReceipts.where('tripId').equals(tripId).reverse().sortBy('capturedAt')
        : [],
    [tripId],
    [],
  )

  // Resolves the active trip itself rather than trusting the tripId above:
  // that value comes from useActiveTripId's async effect, which hasn't
  // necessarily settled yet on first render (e.g. a capture fired the
  // instant the app opens). Going straight to getOrCreateActiveTrip means a
  // capture can never silently no-op while the hook is still catching up.
  const captureReceipt = async (imageBlob: Blob) => {
    const trip = await getOrCreateActiveTrip()
    await db.pendingReceipts.add({
      tripId: trip.id,
      imageBlob,
      capturedAt: Date.now(),
      status: 'pending',
    })
  }

  const removeReceipt = async (id: number) => {
    await db.pendingReceipts.delete(id)
  }

  return { pendingReceipts: pendingReceipts ?? [], captureReceipt, removeReceipt }
}
