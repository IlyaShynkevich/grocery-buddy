import { useLiveQuery } from 'dexie-react-hooks'
import { db, type PendingReceipt } from '../../db/db'
import { useActiveTripId } from '../trip/useActiveTripId'

/**
 * The oldest still-unreviewed, done receipt for the active trip, if any —
 * the same "should the review panel show" condition consumed by both the
 * review panel itself (see useReceiptReview) and the shopping list, which
 * auto-collapses while this is non-undefined so the review panel and Save
 * trip button are both visible together without scrolling.
 */
export function usePendingReceipt(): PendingReceipt | undefined {
  const tripId = useActiveTripId()

  return useLiveQuery(async () => {
    if (!tripId) return undefined
    const candidates = await db.pendingReceipts
      .where('tripId')
      .equals(tripId)
      .filter((r) => r.status === 'done' && r.reviewed === false)
      .sortBy('capturedAt')
    return candidates[0]
  }, [tripId])
}
