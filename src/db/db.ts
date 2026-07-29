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
  /** timestamp to auto-retry at, when lastError parsed a rate-limit wait time */
  retryAt?: number
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

export function newTrip(overrides: Partial<Omit<Trip, 'id'>> = {}): Omit<Trip, 'id'> {
  return {
    date: new Date().toISOString().slice(0, 10),
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
export async function getOrCreateActiveTrip(): Promise<Trip> {
  const pointer = await db.appState.get(ACTIVE_TRIP_KEY)
  if (typeof pointer?.value === 'number') {
    const pinned = await db.trips.get(pointer.value)
    if (pinned && pinned.status === 'draft') return pinned
  }

  const drafts = await db.trips.where('status').equals('draft').toArray()
  const trip = drafts.length === 1 ? drafts[0] : await createTrip()
  await db.appState.put({ key: ACTIVE_TRIP_KEY, value: trip.id })
  return trip
}
