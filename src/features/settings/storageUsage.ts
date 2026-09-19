import { db } from '../../db/db'

/** Receipt photos waiting in the app (they're deleted once their trip is saved). */
export interface PhotoUsage {
  count: number
  bytes: number
}

/**
 * The browser's own estimate of everything this site stores. Chromium also
 * splits it by storage type (`usageDetails`), which gives a real breakdown;
 * other browsers only report a total. Either way it's an estimate — browsers
 * round and pad it — so it's shown as such.
 */
export type BrowserUsage =
  | { kind: 'detailed'; total: number; tripData: number; appFiles: number }
  | { kind: 'total'; total: number; rest: number }
  | { kind: 'unsupported' }

/** Photos are part of IndexedDB; this reads them straight from the database. */
export async function readPhotoUsage(): Promise<PhotoUsage> {
  let count = 0
  let bytes = 0
  await db.pendingReceipts.each((receipt) => {
    if (receipt.imageBlob) {
      count++
      bytes += receipt.imageBlob.size
    }
  })
  return { count, bytes }
}

/** Rejects if the browser fails to produce an estimate — the caller shows why. */
export async function readBrowserUsage(photoBytes: number): Promise<BrowserUsage> {
  if (!navigator.storage?.estimate) return { kind: 'unsupported' }
  const estimate = (await navigator.storage.estimate()) as StorageEstimate & { usageDetails?: Record<string, number> }
  const total = estimate.usage
  if (total === undefined) return { kind: 'unsupported' }

  const details = estimate.usageDetails
  if (details && details.indexedDB !== undefined) {
    // Photos live in IndexedDB, so trip data is IndexedDB minus photos;
    // everything else the browser counts (the service worker's cached app
    // files and its registration) is the app itself. Clamped at 0 because
    // estimates are rounded independently and can undershoot the exact
    // photo sizes by a little.
    return {
      kind: 'detailed',
      total,
      tripData: Math.max(0, details.indexedDB - photoBytes),
      appFiles: Math.max(0, total - details.indexedDB),
    }
  }
  return { kind: 'total', total, rest: Math.max(0, total - photoBytes) }
}
