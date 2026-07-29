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
}

export const db = new Dexie('grocery-buddy') as Dexie & {
  trips: EntityTable<Trip, 'id'>
  items: EntityTable<Item, 'id'>
  pendingReceipts: EntityTable<PendingReceipt, 'id'>
}

db.version(1).stores({
  trips: '++id, date, status',
  items: '++id, tripId, category',
  pendingReceipts: '++id, tripId, status',
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
