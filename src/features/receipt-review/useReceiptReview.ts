import { useLiveQuery } from 'dexie-react-hooks'
import { db, recomputeTripTotal, type Item } from '../../db/db'
import { usePendingReceipt } from './usePendingReceipt'

/** One staged (not-yet-inserted) item, addressed by its stable index into the receipt's `stagedItems`. */
export interface StagedItemView {
  stagedIndex: number
  item: Omit<Item, 'id'>
}

export interface ResolvedMatch {
  typedItemId: number
  stagedIndex: number
  typedItem: Item
  stagedItem: Omit<Item, 'id'>
}

/**
 * Drives the review panel shown automatically after a receipt finishes
 * extraction (see processReceipt in useReceiptCapture.ts). Extraction
 * results are held on the PendingReceipt row itself (`stagedItems`,
 * `suggestedMatches`) — deliberately never written to `items` until
 * `confirmReview` runs. That keeps the shopping list purely the user's own
 * typed notes plus whatever they've explicitly confirmed from a scan, and
 * means dismissing the review or deleting the receipt photo discards the
 * scan with zero `items` writes ever having happened.
 */
export function useReceiptReview() {
  const receipt = usePendingReceipt()

  // Only the typed side needs a live Dexie read — it's a real, pre-existing
  // row that could itself be edited (renamed, etc.) while the review is
  // open. The extracted side lives entirely on `receipt` already.
  const typedItemsById = useLiveQuery(async () => {
    const typedIds = (receipt?.suggestedMatches ?? []).map((match) => match.typedItemId)
    if (typedIds.length === 0) return new Map<number, Item>()
    const rows = await db.items.bulkGet(typedIds)
    return new Map(rows.filter((row): row is Item => row !== undefined).map((row) => [row.id, row]))
  }, [receipt])

  // Discount lines are internal accounting (already counted toward the trip
  // total at Confirm), never something to review/edit as a purchasable item
  // — same as they're excluded from the shopping list itself.
  const addedItems: StagedItemView[] = (receipt?.stagedItems ?? [])
    .map((staged, stagedIndex) => ({ stagedIndex, item: staged.item, removed: staged.removed }))
    .filter((staged) => !staged.removed && !staged.item.isDiscount)
    .map(({ stagedIndex, item }) => ({ stagedIndex, item }))

  const matches: ResolvedMatch[] = (receipt?.suggestedMatches ?? [])
    .filter((match) => match.decision === undefined)
    .flatMap((match) => {
      const staged = receipt?.stagedItems?.[match.stagedIndex]
      const typedItem = typedItemsById?.get(match.typedItemId)
      if (!staged || staged.removed || !typedItem) return []
      return [{ typedItemId: match.typedItemId, stagedIndex: match.stagedIndex, typedItem, stagedItem: staged.item }]
    })

  const resolveMatch = async (typedItemId: number, decision: 'merge' | 'separate') => {
    if (!receipt) return
    const updated = (receipt.suggestedMatches ?? []).map((match) =>
      match.typedItemId === typedItemId ? { ...match, decision } : match,
    )
    await db.pendingReceipts.update(receipt.id, { suggestedMatches: updated })
  }

  const removeItem = async (stagedIndex: number) => {
    if (!receipt) return
    const updatedStaged = (receipt.stagedItems ?? []).map((staged, index) =>
      index === stagedIndex ? { ...staged, removed: true } : staged,
    )
    await db.pendingReceipts.update(receipt.id, {
      stagedItems: updatedStaged,
      // No point still asking about a match for an item the user just removed.
      suggestedMatches: (receipt.suggestedMatches ?? []).filter((match) => match.stagedIndex !== stagedIndex),
    })
  }

  const updatePrice = async (stagedIndex: number, price: number) => {
    if (!receipt) return
    const updatedStaged = (receipt.stagedItems ?? []).map((staged, index) =>
      index === stagedIndex ? { ...staged, item: { ...staged.item, price } } : staged,
    )
    await db.pendingReceipts.update(receipt.id, { stagedItems: updatedStaged })
  }

  /** Materializes the surviving staged items into `items`, applies any resolved merges, and recomputes the trip total — all in one transaction. */
  const confirmReview = async () => {
    if (!receipt) return
    await db.transaction('rw', db.items, db.trips, db.pendingReceipts, async () => {
      const mergedTypedItemIds = new Set(
        (receipt.suggestedMatches ?? []).filter((match) => match.decision === 'merge').map((match) => match.typedItemId),
      )
      for (const typedItemId of mergedTypedItemIds) {
        await db.items.delete(typedItemId)
      }

      const survivors = (receipt.stagedItems ?? []).filter((staged) => !staged.removed).map((staged) => staged.item)
      if (survivors.length > 0) {
        await db.items.bulkAdd(survivors)
      }

      if (receipt.tripId) await recomputeTripTotal(receipt.tripId)

      await db.pendingReceipts.update(receipt.id, { reviewed: true, stagedItems: [], suggestedMatches: [] })
    })
  }

  /** Discards the staged items with no `items` writes — as if this scan never happened. The receipt photo itself is untouched (removeReceipt is a separate, explicit action). */
  const dismissReview = async () => {
    if (!receipt) return
    await db.pendingReceipts.update(receipt.id, { reviewed: true, stagedItems: [], suggestedMatches: [] })
  }

  return {
    receipt,
    addedItems,
    matches,
    resolveMatch,
    removeItem,
    updatePrice,
    confirmReview,
    dismissReview,
  }
}
