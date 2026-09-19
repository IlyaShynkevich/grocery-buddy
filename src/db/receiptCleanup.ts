import { db, isReceiptFinished } from './db'

/**
 * ONE-TIME cleanup of the receipt backlog left by the app's old behavior:
 * before Save trip deleted a trip's receipts (see completeTrip), every
 * receipt ever scanned stayed in IndexedDB with its full-resolution photo,
 * attached to a trip the app never shows again — ~76MB on the real device,
 * and ~100MB in its backups.
 *
 * When: once per database, on app load (ReceiptCleanupNotice, mounted at
 * the App root, calls runReceiptCleanupOnce). Tracked by the appState key
 * below, written in the same transaction as the deletes — so it either
 * fully happens and is recorded, or (on any failure) nothing is deleted
 * and nothing recorded, and it runs again on the next load.
 *
 * What: only receipts whose trip is complete AND that are finished (see
 * isReceiptFinished — processed, review resolved). A pending, processing
 * or failed receipt, or one with a review still open, is never touched,
 * even on a saved trip; it's only counted, so the user is told about it.
 * Receipts on draft trips, or with no trip at all, aren't considered.
 */
export const RECEIPT_CLEANUP_KEY = 'cleanup:savedTripReceipts:v1'

export interface ReceiptCleanupResult {
  ranAt: number
  /** receipt rows (with their photos) deleted */
  removed: number
  /** total size of the deleted photos */
  freedBytes: number
  /** receipts on saved trips left alone because they aren't finished */
  keptUnfinished: number
}

/** Returns null if it already ran on this database (nothing done this time). */
export async function cleanupSavedTripReceipts(): Promise<ReceiptCleanupResult | null> {
  return db.transaction('rw', db.trips, db.pendingReceipts, db.appState, async () => {
    if (await db.appState.get(RECEIPT_CLEANUP_KEY)) return null

    const completeTripIds = new Set(await db.trips.where('status').equals('complete').primaryKeys())
    const onSavedTrips = await db.pendingReceipts
      .filter((receipt) => receipt.tripId !== null && completeTripIds.has(receipt.tripId))
      .toArray()
    const finished = onSavedTrips.filter(isReceiptFinished)

    const result: ReceiptCleanupResult = {
      ranAt: Date.now(),
      removed: finished.length,
      freedBytes: finished.reduce((sum, receipt) => sum + (receipt.imageBlob?.size ?? 0), 0),
      keptUnfinished: onSavedTrips.length - finished.length,
    }

    await db.pendingReceipts.bulkDelete(finished.map((receipt) => receipt.id))
    await db.appState.put({ key: RECEIPT_CLEANUP_KEY, value: JSON.stringify(result) })
    return result
  })
}

let run: Promise<ReceiptCleanupResult | null> | null = null

/**
 * The same promise for every caller within a page load — React StrictMode
 * mounts effects twice in dev, and a second concurrent call would otherwise
 * see the first one's marker and report "nothing done", hiding its result.
 */
export function runReceiptCleanupOnce(): Promise<ReceiptCleanupResult | null> {
  run ??= cleanupSavedTripReceipts()
  return run
}
