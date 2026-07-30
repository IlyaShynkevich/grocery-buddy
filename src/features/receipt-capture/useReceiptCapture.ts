import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef } from 'react'
import { db, getOrCreateActiveTrip, newItem, recomputeTripTotal, type PendingReceipt } from '../../db/db'
import { extractReceiptItems } from './extractReceipt'
import { parseRetryAfterSeconds } from './retryAfter'
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
    await db.pendingReceipts.update(receipt.id, {
      status: 'processing',
      lastError: undefined,
      retryAt: undefined,
    })

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
      // Full raw error for our own diagnosis — the UI only ever shows a
      // short, human-readable message derived from this (see errorMessage.ts).
      console.error('RECEIPT_EXTRACTION_ERROR:', err)

      const message = err instanceof Error ? err.message : 'Unknown error'
      // If Groq gave us a rate-limit wait time (e.g. "...try again in 16.6s"),
      // schedule an automatic retry for then; otherwise leave retryAt unset
      // and fall back to manual-retry-only, same as before this existed.
      const retryAfterSeconds = parseRetryAfterSeconds(message)
      await db.pendingReceipts.update(receipt.id, {
        status: 'failed',
        lastError: message,
        retryAt: retryAfterSeconds !== null ? Date.now() + retryAfterSeconds * 1000 : undefined,
      })
    }
  }

  // A receipt can be stranded at 'processing' if the tab reloads, closes, or
  // crashes mid-extraction — there's no in-flight promise left to finish it
  // once the page is gone, and 'processing' rows are deliberately excluded
  // from the sync/manual-retry candidate set below (to avoid double-running
  // a still-active attempt). Reclaim any such leftovers back to 'pending' on
  // mount so they're eligible for the next sync or manual retry instead of
  // being stuck forever with no retry button.
  useEffect(() => {
    void db.pendingReceipts.where('status').equals('processing').modify({ status: 'pending' })
  }, [])

  // Auto-sync on reconnect: when the browser regains connectivity, sweep
  // *all* pending/failed receipts (not just the active trip's — a stale
  // receipt from a previous trip should still get its shot) and process
  // them one at a time, reusing processReceipt so rate-limit auto-retry and
  // error handling behave identically to a manual click.
  const isSyncingRef = useRef(false)
  // Set when a trigger arrives while a sweep is already running. A
  // receipt's candidate list is snapshotted at the start of each pass, so a
  // receipt that becomes eligible mid-sweep (e.g. two captures in quick
  // succession, or a second 'online' event firing while the first sweep's
  // pass is still mid-extraction) would otherwise be silently missed
  // forever: the concurrent trigger is a no-op (guarded below) and the
  // in-progress pass never re-queries. Looping once more after the current
  // pass finishes whenever that happened closes the gap.
  const needsAnotherPassRef = useRef(false)
  useEffect(() => {
    const syncPendingReceipts = async () => {
      if (isSyncingRef.current) {
        needsAnotherPassRef.current = true
        return
      }
      isSyncingRef.current = true
      try {
        do {
          needsAnotherPassRef.current = false
          const candidates = await db.pendingReceipts.where('status').anyOf('pending', 'failed').sortBy('capturedAt')
          for (const candidate of candidates) {
            // Re-check right before processing: another in-flight process (a
            // scheduled rate-limit retry, a manual click) may have already
            // picked this receipt up since the sweep started.
            const fresh = await db.pendingReceipts.get(candidate.id)
            if (!fresh || (fresh.status !== 'pending' && fresh.status !== 'failed')) continue
            await processReceipt(fresh)
          }
        } while (needsAnotherPassRef.current)
      } finally {
        isSyncingRef.current = false
      }
    }

    window.addEventListener('online', syncPendingReceipts)
    return () => window.removeEventListener('online', syncPendingReceipts)
  }, [])

  return { pendingReceipts: pendingReceipts ?? [], captureReceipt, removeReceipt, processReceipt }
}
