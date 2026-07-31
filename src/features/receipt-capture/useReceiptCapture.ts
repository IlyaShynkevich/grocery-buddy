import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef } from 'react'
import {
  claimReceiptForProcessing,
  db,
  getOrCreateActiveTrip,
  newItem,
  recomputeTripTotal,
  type PendingReceipt,
  type SuggestedItemMatch,
} from '../../db/db'
import { isLikelyMatch } from '../../lib/itemMatch'
import { ExtractionRequestError, extractReceiptItems } from './extractReceipt'
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
    // Atomic claim — closes a real race between the three independent
    // triggers that can all call this function for the same receipt at
    // once (a manual Retry click, ReceiptRow's per-row auto-retry timer,
    // and the online-reconnect sweep below). See claimReceiptForProcessing's
    // doc comment in db.ts for the full race and why this has to be atomic.
    const claimed = await claimReceiptForProcessing(receipt.id)
    if (!claimed) return // lost the race — another trigger already has this receipt
    receipt = claimed

    try {
      const extractedItems = await extractReceiptItems(receipt.imageBlob)

      const addedItemIds: number[] = []
      const suggestedMatches: SuggestedItemMatch[] = []

      if (receipt.tripId) {
        const tripId = receipt.tripId

        // Snapshot of what was typed before this scan — used to suggest
        // merges in the review panel. Discounts are internal accounting
        // lines, never a match candidate for a typed product.
        const typedItems = await db.items
          .where('tripId')
          .equals(tripId)
          .filter((item) => item.source === 'typed' && !item.isDiscount)
          .toArray()
        const matchedTypedIds = new Set<number>()

        for (const extracted of extractedItems) {
          const newId = await db.items.add(newItem(tripId, { ...extracted, source: 'ai' }))
          addedItemIds.push(newId)

          if (!extracted.isDiscount) {
            const match = typedItems.find(
              (typed) => !matchedTypedIds.has(typed.id) && isLikelyMatch(typed.name, extracted.name),
            )
            if (match) {
              matchedTypedIds.add(match.id)
              suggestedMatches.push({ typedItemId: match.id, extractedItemId: newId })
            }
          }
        }

        await recomputeTripTotal(tripId)
      }

      // The review panel (see receipt-review feature) shows automatically
      // for any 'done' receipt with reviewed: false — items are already
      // added at this point either way, so ignoring the panel never loses
      // anything, it just leaves the (harmless) duplicates/typos for later.
      await db.pendingReceipts.update(receipt.id, {
        status: 'done',
        addedItemIds,
        suggestedMatches,
        reviewed: addedItemIds.length === 0,
      })
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
        lastErrorStatus: err instanceof ExtractionRequestError ? err.status : undefined,
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
            // picked this receipt up since the sweep started. This is just a
            // cheap fast-path skip, not the thing that actually makes this
            // safe against a same-instant race with the per-row auto-retry
            // timer — processReceipt's own atomic claim (see its comment)
            // is what guarantees only one trigger ever proceeds to call Groq
            // even if both read the row as eligible here.
            const fresh = await db.pendingReceipts.get(candidate.id)
            if (!fresh || (fresh.status !== 'pending' && fresh.status !== 'failed')) continue
            // A failed receipt with a still-future retryAt already has its own
            // scheduled retry (see ReceiptRow) honoring Groq's requested
            // backoff — repeated 'online' events (flaky connectivity) must not
            // bypass that by retrying it again early, which would just
            // re-trigger the same rate limit before it had a chance to clear.
            if (fresh.status === 'failed' && fresh.retryAt !== undefined && fresh.retryAt > Date.now()) continue
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
