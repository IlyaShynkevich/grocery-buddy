/**
 * TEMPORARY — on-device timing for the "~7s before anything happens after
 * taking a receipt photo" investigation. Enabled only with `?perf=1` in the
 * URL; every call below is a no-op otherwise. Remove once the phone's
 * numbers are in: delete src/features/perf/ and every import of it.
 *
 * Timestamps are wall-clock (Date.now()), not performance.now(), and the log
 * is persisted to sessionStorage, so it survives the page being reloaded
 * while the camera app is in the foreground — a reload is itself one of the
 * things this is meant to detect (it shows up as a new "page load" entry).
 */

export interface PerfEntry {
  label: string
  /** epoch ms */
  t: number
}

const STORAGE_KEY = 'grocery-buddy:perfLog'

export const PERF_ENABLED = new URLSearchParams(window.location.search).get('perf') === '1'

let entries: PerfEntry[] = []
let storageError: string | null = null
const listeners = new Set<() => void>()

function reportStorageError(action: string, err: unknown) {
  console.error(`Perf log: failed to ${action} sessionStorage`, err)
  storageError = `Couldn't ${action} the saved log: ${err instanceof Error ? err.message : String(err)}`
}

function loadEntries(): PerfEntry[] {
  let raw: string | null
  try {
    raw = sessionStorage.getItem(STORAGE_KEY)
  } catch (err) {
    reportStorageError('read', err)
    return []
  }
  if (raw === null) return []

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    reportStorageError('parse', err)
    return []
  }
  const valid =
    Array.isArray(parsed) &&
    parsed.every((e) => e && typeof e === 'object' && typeof e.label === 'string' && typeof e.t === 'number')
  if (!valid) {
    reportStorageError('parse', new Error(`unexpected shape: ${raw.slice(0, 200)}`))
    return []
  }
  return parsed as PerfEntry[]
}

function persist() {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch (err) {
    reportStorageError('write', err)
  }
}

function update(next: PerfEntry[]) {
  entries = next
  persist()
  listeners.forEach((listener) => listener())
}

export function perfMark(label: string, t: number = Date.now()) {
  if (!PERF_ENABLED) return
  update([...entries, { label, t }])
}

export function clearPerfLog() {
  storageError = null
  update([])
}

export function getPerfEntries(): PerfEntry[] {
  return entries
}

export function getPerfStorageError(): string | null {
  return storageError
}

export function subscribePerfLog(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// "row shown" / "thumbnail loaded" should fire once, for the receipt the
// user just captured — not for every existing row that remounts on a tab
// switch. Armed with the time just before capture; the first receipt row
// whose capturedAt is at or after that time fires each milestone once.
const armedAt: Partial<Record<'row' | 'thumbnail', number>> = {}

export function perfArmNextReceipt() {
  if (!PERF_ENABLED) return
  const now = Date.now()
  armedAt.row = now
  armedAt.thumbnail = now
}

export function perfNewReceiptMilestone(kind: 'row' | 'thumbnail', capturedAt: number, label: string) {
  const armed = armedAt[kind]
  if (!PERF_ENABLED || armed === undefined || capturedAt < armed) return
  delete armedAt[kind]
  perfMark(label)
}

if (PERF_ENABLED) {
  entries = loadEntries()
  perfMark('page load (navigation start)', Math.round(performance.timeOrigin))
  perfMark('app script running')
  document.addEventListener('visibilitychange', () => {
    perfMark(document.visibilityState === 'hidden' ? 'app hidden' : 'app visible')
  })
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) perfMark('page restored from back/forward cache')
  })
}
