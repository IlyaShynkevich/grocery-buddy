import { useSyncExternalStore } from 'react'

/** How long a toast stays up, including its fade in/out (see .gb-toast in index.css). */
export const TOAST_DURATION_MS = 2600

export interface ToastMessage {
  /** Distinct per showToast call, so repeating the same text restarts the timer/animation. */
  id: number
  text: string
}

let current: ToastMessage | null = null
let nextId = 1
let hideTimer: number | undefined
const listeners = new Set<() => void>()

function set(next: ToastMessage | null) {
  current = next
  listeners.forEach((listener) => listener())
}

/** Shows a brief message at the bottom of the screen that fades on its own; a new one replaces any showing. */
export function showToast(text: string) {
  window.clearTimeout(hideTimer)
  set({ id: nextId++, text })
  hideTimer = window.setTimeout(() => set(null), TOAST_DURATION_MS)
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useToast(): ToastMessage | null {
  return useSyncExternalStore(subscribe, () => current)
}
