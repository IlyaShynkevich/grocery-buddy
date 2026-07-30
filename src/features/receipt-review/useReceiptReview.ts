import { useLiveQuery } from 'dexie-react-hooks'
import { db, recomputeTripTotal, type Item } from '../../db/db'
import { useActiveTripId } from '../trip/useActiveTripId'

export interface ResolvedMatch {
  typedItemId: number
  extractedItemId: number
  typedItem: Item
  extractedItem: Item
}

/**
 * Drives the review panel shown automatically after a receipt finishes
 * extraction (see processReceipt in useReceiptCapture.ts — items are
 * already added to the trip by the time this runs, this is purely a
 * reconciliation pass: fix a typo, drop a misread line, or merge a
 * duplicate against something the user had already typed in).
 */
export function useReceiptReview() {
  const tripId = useActiveTripId()

  const receipt = useLiveQuery(async () => {
    if (!tripId) return undefined
    const candidates = await db.pendingReceipts
      .where('tripId')
      .equals(tripId)
      .filter((r) => r.status === 'done' && r.reviewed === false)
      .sortBy('capturedAt')
    return candidates[0]
  }, [tripId])

  const addedItems = useLiveQuery(async () => {
    if (!receipt?.addedItemIds?.length) return []
    const items = await db.items.bulkGet(receipt.addedItemIds)
    return items.filter((item): item is Item => item !== undefined && !item.isDiscount)
  }, [receipt])

  const matches = useLiveQuery(async () => {
    if (!receipt?.suggestedMatches?.length) return []
    const resolved = await Promise.all(
      receipt.suggestedMatches.map(async (match) => {
        const [typedItem, extractedItem] = await Promise.all([
          db.items.get(match.typedItemId),
          db.items.get(match.extractedItemId),
        ])
        return typedItem && extractedItem ? { ...match, typedItem, extractedItem } : null
      }),
    )
    return resolved.filter((match): match is ResolvedMatch => match !== null)
  }, [receipt])

  const resolveMatch = async (typedItemId: number, decision: 'merge' | 'separate') => {
    if (!receipt) return
    if (decision === 'merge') {
      await db.items.delete(typedItemId)
      if (receipt.tripId) await recomputeTripTotal(receipt.tripId)
    }
    await db.pendingReceipts.update(receipt.id, {
      suggestedMatches: (receipt.suggestedMatches ?? []).filter((match) => match.typedItemId !== typedItemId),
    })
  }

  const removeItem = async (itemId: number) => {
    if (!receipt) return
    await db.items.delete(itemId)
    if (receipt.tripId) await recomputeTripTotal(receipt.tripId)
    await db.pendingReceipts.update(receipt.id, {
      addedItemIds: (receipt.addedItemIds ?? []).filter((id) => id !== itemId),
      suggestedMatches: (receipt.suggestedMatches ?? []).filter((match) => match.extractedItemId !== itemId),
    })
  }

  const updatePrice = async (itemId: number, price: number) => {
    if (!receipt) return
    await db.items.update(itemId, { price })
    if (receipt.tripId) await recomputeTripTotal(receipt.tripId)
  }

  const finishReview = async () => {
    if (!receipt) return
    await db.pendingReceipts.update(receipt.id, { reviewed: true })
  }

  return {
    receipt,
    addedItems: addedItems ?? [],
    matches: matches ?? [],
    resolveMatch,
    removeItem,
    updatePrice,
    finishReview,
  }
}
