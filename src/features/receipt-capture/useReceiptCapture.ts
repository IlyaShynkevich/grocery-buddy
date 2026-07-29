import { useLiveQuery } from 'dexie-react-hooks'
import { db, getOrCreateActiveTrip, newItem, recomputeTripTotal, type PendingReceipt } from '../../db/db'
import { extractReceiptItems } from './extractReceipt'
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

  const processReceipt = async (receipt: PendingReceipt) => {
    await db.pendingReceipts.update(receipt.id, { status: 'processing', lastError: undefined })

    try {
      const items = await extractReceiptItems(receipt.imageBlob)

      if (receipt.tripId) {
        for (const item of items) {
          await db.items.add(newItem(receipt.tripId, { ...item, source: 'ai' }))
        }
        await recomputeTripTotal(receipt.tripId)
      }

      await db.pendingReceipts.update(receipt.id, { status: 'done' })
    } catch (err) {
      await db.pendingReceipts.update(receipt.id, {
        status: 'failed',
        lastError: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }

  return { pendingReceipts: pendingReceipts ?? [], captureReceipt, removeReceipt, processReceipt }
}
