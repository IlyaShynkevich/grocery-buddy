import Dexie, { type EntityTable } from 'dexie'
import { DEFAULT_CATEGORY_KEY } from './categories'

export type TripStatus = 'draft' | 'complete'
export type ItemSource = 'typed' | 'ai' | 'manual'
export type ReceiptStatus = 'pending' | 'processing' | 'failed' | 'done'

export interface Trip {
  id: number
  /** ISO date, e.g. '2026-07-29' */
  date: string
  store?: string
  total: number
  status: TripStatus
  createdAt: number
  /** set when status becomes 'complete' — history is sorted by this, not date (same-day trips tie on date) */
  completedAt?: number
}

export interface Item {
  id: number
  tripId: number
  name: string
  /** null until a price is known (e.g. typed in-store, before checkout) */
  price: number | null
  /** key into CATEGORIES */
  category: string
  /** null = use the category's default essential/non-essential; else user override */
  essentialOverride: boolean | null
  source: ItemSource
  /**
   * A coupon/discount line from a receipt (negative price), not a
   * purchasable product. Excluded from the shopping list but still counted
   * in recomputeTripTotal so the trip total matches the receipt.
   */
  isDiscount: boolean
}

export interface SuggestedItemMatch {
  typedItemId: number
  extractedItemId: number
}

export interface PendingReceipt {
  id: number
  /** null if captured before being attached to a trip */
  tripId: number | null
  imageBlob: Blob
  capturedAt: number
  status: ReceiptStatus
  /** message from the most recent failed extraction attempt, if any */
  lastError?: string
  /** HTTP status of the most recent failed attempt, when it came from our API (not a network/timeout failure) */
  lastErrorStatus?: number
  /** timestamp to auto-retry at, when lastError parsed a rate-limit wait time */
  retryAt?: number
  /**
   * Ids of the Item rows created from this receipt's extraction, once
   * status is 'done' — items are added immediately (see M5 part 1), this
   * just tracks which ones came from this receipt for the review panel.
   */
  addedItemIds?: number[]
  /** Best-effort typed/extracted item pairs the review panel offers to merge. */
  suggestedMatches?: SuggestedItemMatch[]
  /** Whether the user has confirmed/dismissed the post-scan review panel. */
  reviewed?: boolean
}

/** Single-row-per-key table for small pointers like "which trip is active". */
export interface AppStateEntry {
  key: string
  value: number | string | null
}

export const db = new Dexie('grocery-buddy') as Dexie & {
  trips: EntityTable<Trip, 'id'>
  items: EntityTable<Item, 'id'>
  pendingReceipts: EntityTable<PendingReceipt, 'id'>
  appState: EntityTable<AppStateEntry, 'key'>
}

db.version(1).stores({
  trips: '++id, date, status',
  items: '++id, tripId, category',
  pendingReceipts: '++id, tripId, status',
})

db.version(2).stores({
  appState: '&key',
})

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10)
}

export function newTrip(overrides: Partial<Omit<Trip, 'id'>> = {}): Omit<Trip, 'id'> {
  return {
    date: todayDateString(),
    store: undefined,
    total: 0,
    status: 'draft',
    createdAt: Date.now(),
    ...overrides,
  }
}

export function newItem(
  tripId: number,
  overrides: Partial<Omit<Item, 'id' | 'tripId'>> = {},
): Omit<Item, 'id'> {
  return {
    tripId,
    name: '',
    price: null,
    category: DEFAULT_CATEGORY_KEY,
    essentialOverride: null,
    source: 'typed',
    isDiscount: false,
    ...overrides,
  }
}

export async function recomputeTripTotal(tripId: number): Promise<number> {
  const items = await db.items.where('tripId').equals(tripId).toArray()
  const total = items.reduce((sum, item) => sum + (item.price ?? 0), 0)
  await db.trips.update(tripId, { total })
  return total
}

export const ACTIVE_TRIP_KEY = 'activeTripId'

async function createTrip(): Promise<Trip> {
  const id = await db.trips.add(newTrip())
  const created = await db.trips.get(id)
  if (!created) throw new Error('Failed to create trip')
  return created
}

/**
 * The trip currently being shopped. Identity is a persisted pointer
 * (appState.activeTripId), not "most recently created draft" — otherwise
 * any other code path that creates a draft trip (the debug panel today,
 * receipt capture in M3) would silently hijack the active trip out from
 * under whatever the user is actively building.
 *
 * If the pointer is missing or stale (points at a trip that's gone or no
 * longer a draft), we do NOT guess by grabbing "the latest draft" — that's
 * the same fragile heuristic that caused the original bug, just moved one
 * level down, and would misfire the moment something else (debug panel)
 * has created a newer draft. We only auto-adopt an existing draft when
 * there's exactly one unambiguous candidate (e.g. upgrading from before
 * this pointer existed); otherwise we start a fresh trip rather than risk
 * picking the wrong one.
 */
// Guards the read-then-create below against concurrent callers: App.tsx
// mounts multiple features (shopping list, receipt capture) that each call
// this independently on load via useActiveTripId. Without this, two calls
// racing with no pointer set yet would both see zero drafts and both call
// createTrip(), leaving two trips after a fresh load/reset. Safe because JS
// runs each synchronous chunk to completion: the assignment to
// pendingActiveTripCreation happens with no intervening await, so a second
// caller checking it always sees either null (and creates the shared
// promise) or the in-flight promise from the first caller — never a gap.
let pendingActiveTripCreation: Promise<Trip> | null = null

/**
 * A draft trip's `date` is only ever set once, at creation. If it's still
 * the active draft when the calendar day rolls over, its date would
 * otherwise stay stale until the next trip is created (e.g. via Save
 * trip) — so every read of the active draft refreshes it to today first.
 * A no-op (no DB write) once it's already current. Completed trips are
 * left alone — their date is a historical record, not "today".
 */
export async function refreshDraftDate(trip: Trip): Promise<Trip> {
  if (trip.status !== 'draft') return trip
  const today = todayDateString()
  if (trip.date === today) return trip
  await db.trips.update(trip.id, { date: today })
  return { ...trip, date: today }
}

export async function getOrCreateActiveTrip(): Promise<Trip> {
  const pointer = await db.appState.get(ACTIVE_TRIP_KEY)
  if (typeof pointer?.value === 'number') {
    const pinned = await db.trips.get(pointer.value)
    if (pinned && pinned.status === 'draft') return refreshDraftDate(pinned)
  }

  if (pendingActiveTripCreation) return pendingActiveTripCreation

  pendingActiveTripCreation = (async () => {
    try {
      const drafts = await db.trips.where('status').equals('draft').toArray()
      const trip = drafts.length === 1 ? await refreshDraftDate(drafts[0]) : await createTrip()
      await db.appState.put({ key: ACTIVE_TRIP_KEY, value: trip.id })
      return trip
    } finally {
      pendingActiveTripCreation = null
    }
  })()

  return pendingActiveTripCreation
}

/**
 * Marks a trip complete and immediately starts a fresh empty draft as the
 * new active trip, so the user never has to manually set one up before
 * their next shopping run. The completed trip's items/total are untouched
 * — nothing here mutates them, "saving" only changes the trip's own status.
 */
export async function completeTrip(tripId: number): Promise<Trip> {
  await db.trips.update(tripId, { status: 'complete', completedAt: Date.now() })

  const newId = await db.trips.add(newTrip())
  await db.appState.put({ key: ACTIVE_TRIP_KEY, value: newId })

  const created = await db.trips.get(newId)
  if (!created) throw new Error('Failed to create new trip')
  return created
}

/**
 * Permanently removes a trip and everything attached to it (items, any
 * pending receipts still pointing at it). If the trip being deleted is the
 * one the active-trip pointer refers to — normally only possible for a
 * draft, but the debug panel's "Make active" can point it at a completed
 * trip too — a fresh empty draft is created and pinned as active in its
 * place, same as completeTrip does, so the app is never left without an
 * active trip to shop into.
 */
export async function deleteTrip(tripId: number): Promise<void> {
  await db.transaction('rw', db.trips, db.items, db.pendingReceipts, db.appState, async () => {
    await db.items.where('tripId').equals(tripId).delete()
    await db.pendingReceipts.where('tripId').equals(tripId).delete()
    await db.trips.delete(tripId)

    const pointer = await db.appState.get(ACTIVE_TRIP_KEY)
    if (pointer?.value === tripId) {
      const newId = await db.trips.add(newTrip())
      await db.appState.put({ key: ACTIVE_TRIP_KEY, value: newId })
    }
  })
}
