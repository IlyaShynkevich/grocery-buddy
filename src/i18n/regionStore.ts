import { useSyncExternalStore } from 'react'
import { DEFAULT_REGION_ID, isRegionId, REGIONS, type Region, type RegionId } from './regions'

/**
 * The active region, persisted per device in localStorage — read
 * synchronously so the very first render is already in the right language
 * (no flash of English), and readable by the standalone login page
 * (public/login.html), which uses the same key. Deliberately not in
 * IndexedDB/backups: it's a device preference, while the data that depends
 * on it (each trip's currency) is stored on the trip itself.
 */
export const REGION_STORAGE_KEY = 'grocery-buddy:region'

function loadRegionId(): RegionId {
  let stored: string | null
  try {
    stored = localStorage.getItem(REGION_STORAGE_KEY)
  } catch (err) {
    console.error('Grocery Buddy: could not read the language setting — using the default', err)
    return DEFAULT_REGION_ID
  }
  if (stored === null) return DEFAULT_REGION_ID
  if (!isRegionId(stored)) {
    console.error(`Grocery Buddy: unknown saved language setting ${JSON.stringify(stored)} — using the default`)
    return DEFAULT_REGION_ID
  }
  return stored
}

let current: Region = REGIONS[loadRegionId()]
const listeners = new Set<() => void>()

function applyToDocument(region: Region) {
  document.documentElement.lang = region.htmlLang
}
applyToDocument(current)

export function getRegion(): Region {
  return current
}

/**
 * Switches the app to `id` immediately, then persists it. If persisting
 * fails the switch still applies for this session, and the error is
 * rethrown so the caller can tell the user it won't survive a reload.
 */
export function setRegion(id: RegionId): void {
  current = REGIONS[id]
  applyToDocument(current)
  listeners.forEach((listener) => listener())
  localStorage.setItem(REGION_STORAGE_KEY, id)
}

export function subscribeRegion(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The active region; re-renders the caller when it changes. */
export function useRegion(): Region {
  return useSyncExternalStore(subscribeRegion, getRegion)
}
