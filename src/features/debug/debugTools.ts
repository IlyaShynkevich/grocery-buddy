import { useSyncExternalStore } from 'react'

/**
 * Whether Debug tools is shown (on the Shopping List, as before). Hidden by
 * default and only toggled by a deliberately undiscoverable gesture — three
 * quick taps on the Home page mascot (see HomePage) — since it's a
 * developer tool, not part of the app. Remembered for the browser session
 * (sessionStorage), so it survives reloads but not closing the app.
 */
export const DEBUG_TOOLS_STORAGE_KEY = 'grocery-buddy:debugTools'

function load(): boolean {
  try {
    return sessionStorage.getItem(DEBUG_TOOLS_STORAGE_KEY) === '1'
  } catch (err) {
    console.error('Grocery Buddy: could not read the Debug tools setting — keeping it hidden', err)
    return false
  }
}

let enabled = load()
const listeners = new Set<() => void>()

export function isDebugToolsEnabled(): boolean {
  return enabled
}

/**
 * Flips Debug tools and returns the new state. Applies immediately; if
 * remembering it for the session fails, the error is rethrown (after the
 * switch has applied) so the caller can say it won't survive a reload.
 */
export function toggleDebugTools(): boolean {
  enabled = !enabled
  listeners.forEach((listener) => listener())
  if (enabled) sessionStorage.setItem(DEBUG_TOOLS_STORAGE_KEY, '1')
  else sessionStorage.removeItem(DEBUG_TOOLS_STORAGE_KEY)
  return enabled
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useDebugToolsEnabled(): boolean {
  return useSyncExternalStore(subscribe, isDebugToolsEnabled)
}
