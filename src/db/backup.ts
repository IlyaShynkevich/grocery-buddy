import { blobToDataUrl } from '../lib/dataUrl'
import { db, type AppStateEntry, type CategoryNote, type Item, type PendingReceipt, type ReceiptStatus, type Trip } from './db'

/**
 * Emergency export/import so the user's history survives browser/PWA
 * troubleshooting (cache clearing, uninstall/reinstall, switching devices) —
 * everything lives only in IndexedDB otherwise, with no server-side copy.
 */

/**
 * v1: every receipt row carried its photo — a 20-receipt backup measured
 * 101.6MB, 99.9% of it photos, the other 0.11MB being all the actual trip
 * history.
 * v2: photos only for receipts that still need processing (see buildBackup).
 * Import accepts both.
 */
export const BACKUP_SCHEMA_VERSION = 2

/**
 * pendingReceipts.imageBlob can't survive JSON.stringify — stored as a data
 * URL instead, reconstructed on import. Absent for a receipt already
 * processed at export time (v2+).
 */
interface PendingReceiptExport extends Omit<PendingReceipt, 'imageBlob'> {
  imageBlob?: string
}

export interface BackupData {
  schemaVersion: number
  exportedAt: string
  tables: {
    trips: Trip[]
    items: Item[]
    categoryNotes: CategoryNote[]
    pendingReceipts: PendingReceiptExport[]
    appState: AppStateEntry[]
  }
}

export class BackupValidationError extends Error {}

const RECEIPT_STATUSES: readonly ReceiptStatus[] = ['pending', 'processing', 'failed', 'done']

// A base64 image data URL, nothing else — in particular never a relative or
// remote URL, which fetch() below would happily resolve to whatever that
// address returns (e.g. the app's own HTML) and store as the "photo".
const IMAGE_DATA_URL_PREFIX = /^data:image\/[a-z0-9.+-]+;base64,/i
const BASE64_BODY = /^[A-Za-z0-9+/]+={0,2}$/

function isImageDataUrl(value: string): boolean {
  const prefix = IMAGE_DATA_URL_PREFIX.exec(value)
  return prefix !== null && BASE64_BODY.test(value.slice(prefix[0].length))
}

async function dataUrlToBlob(dataUrl: string, receiptId: unknown): Promise<Blob> {
  // parseBackup has already checked the shape; re-checked here since this
  // is the line that would otherwise store whatever fetch() returns.
  if (!isImageDataUrl(dataUrl)) {
    throw new Error(`Receipt #${String(receiptId)}'s photo is not an image data URL — nothing was imported.`)
  }
  // fetch() on a data: URL is a local decode under the hood, not a network
  // request — works offline and is the simplest cross-browser way back from
  // a data URL to a Blob.
  const response = await fetch(dataUrl)
  if (!response.ok) {
    throw new Error(`Receipt #${String(receiptId)}'s photo could not be decoded (${response.status}) — nothing was imported.`)
  }
  const blob = await response.blob()
  if (blob.size === 0 || !blob.type.startsWith('image/')) {
    throw new Error(
      `Receipt #${String(receiptId)}'s photo decoded to ${blob.size} bytes of ${blob.type || 'unknown type'}, not an image — nothing was imported.`,
    )
  }
  return blob
}

/**
 * A processed ('done') receipt's photo has served its purpose — its items
 * live in `items` (or, until the review is resolved, in the row's own
 * stagedItems) — so it's left out. A receipt that still needs processing
 * keeps its photo: without it, it could never be processed after a restore.
 */
export async function buildBackup(): Promise<BackupData> {
  const [trips, items, categoryNotes, pendingReceipts, appState] = await Promise.all([
    db.trips.toArray(),
    db.items.toArray(),
    db.categoryNotes.toArray(),
    db.pendingReceipts.toArray(),
    db.appState.toArray(),
  ])

  const exportedReceipts = await Promise.all(
    pendingReceipts.map(async ({ imageBlob, ...rest }): Promise<PendingReceiptExport> => {
      if (rest.status === 'done') return rest
      if (!imageBlob) {
        throw new Error(`Receipt #${rest.id} (${rest.status}) has no photo — it can't be processed, so it can't be backed up as-is.`)
      }
      return { ...rest, imageBlob: await blobToDataUrl(imageBlob) }
    }),
  )

  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    tables: { trips, items, categoryNotes, pendingReceipts: exportedReceipts, appState },
  }
}

export function backupFileName(date: Date = new Date()): string {
  return `grocery-buddy-backup-${date.toISOString().slice(0, 10)}.json`
}

/**
 * Real file download via Blob + anchor-tag click, not window.open/location —
 * the pattern that reliably works on Android Chrome (window.open on a blob:
 * URL is blocked/flaky there, and location.href navigation can just show the
 * JSON instead of downloading it). Revoking the object URL is delayed rather
 * than immediate: Android Chrome has been observed to drop the download if
 * the URL is revoked synchronously right after click() fires, since the
 * actual save happens async off the main thread.
 */
export function downloadBackup(backup: BackupData, filename: string): void {
  const json = JSON.stringify(backup, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const REQUIRED_TABLE_KEYS = ['trips', 'items', 'categoryNotes', 'pendingReceipts', 'appState'] as const

/**
 * Parses and validates a backup file's contents. Throws BackupValidationError
 * (never returns a partially-valid result) for anything malformed or from an
 * incompatible/newer schema, so the caller has one clear error path to
 * surface to the user instead of a raw parse exception or, worse, a crash
 * deeper in restoreBackup once bad data hits Dexie.
 */
export function parseBackup(json: string): BackupData {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch (err) {
    throw new BackupValidationError(`That file is not valid JSON (${err instanceof Error ? err.message : String(err)}).`)
  }

  if (!isPlainObject(parsed)) {
    throw new BackupValidationError('That file is not a Grocery Buddy backup (expected a JSON object at the top level).')
  }
  if (typeof parsed.schemaVersion !== 'number') {
    throw new BackupValidationError('That file is missing a schemaVersion — it is not a Grocery Buddy backup file.')
  }
  if (parsed.schemaVersion > BACKUP_SCHEMA_VERSION) {
    throw new BackupValidationError(
      `That backup was made by a newer version of Grocery Buddy (schema v${parsed.schemaVersion}) than this app supports (v${BACKUP_SCHEMA_VERSION}). Update the app, then try importing again.`,
    )
  }
  if (!isPlainObject(parsed.tables)) {
    throw new BackupValidationError('That file is missing its "tables" section — it is not a valid Grocery Buddy backup file.')
  }

  for (const key of REQUIRED_TABLE_KEYS) {
    if (!Array.isArray(parsed.tables[key])) {
      throw new BackupValidationError(`That file's "${key}" table is missing or malformed — it is not a valid Grocery Buddy backup file.`)
    }
  }

  ;(parsed.tables.pendingReceipts as unknown[]).forEach(validateReceiptRow)

  return parsed as unknown as BackupData
}

/**
 * Every receipt row must either carry a real image (data URL) or be one
 * that no longer needs one (already processed). Checked up front, before
 * the user is even asked to confirm, so a damaged file is rejected whole
 * instead of restoring a receipt that can never be processed — or, before
 * this check existed, fetching a missing photo as the URL "undefined" and
 * storing the app's own HTML page as the image.
 */
function validateReceiptRow(row: unknown, index: number) {
  if (!isPlainObject(row)) {
    throw new BackupValidationError(`Receipt entry ${index + 1} in that file is not an object — the backup is damaged. Nothing was imported.`)
  }
  const label = `Receipt #${String(row.id ?? index + 1)}`
  if (!RECEIPT_STATUSES.includes(row.status as ReceiptStatus)) {
    throw new BackupValidationError(`${label} has an unknown status (${JSON.stringify(row.status)}) — the backup is damaged. Nothing was imported.`)
  }
  if (row.imageBlob === undefined) {
    if (row.status !== 'done') {
      throw new BackupValidationError(
        `${label} (${String(row.status)}) has no photo, so it could never be processed after restoring — the backup is incomplete or damaged. Nothing was imported.`,
      )
    }
    return
  }
  if (typeof row.imageBlob !== 'string' || !isImageDataUrl(row.imageBlob)) {
    throw new BackupValidationError(
      `${label}'s photo is not a valid image (expected a base64 "data:image/…" URL) — the backup is damaged. Nothing was imported.`,
    )
  }
}

/**
 * Restores every table from a validated backup. Upserts by id (bulkPut)
 * rather than clearing first, so this is a restore/merge, not a destructive
 * wipe-then-load — rows already present with the same id are overwritten
 * (the UI confirms with the user before calling this, since that IS an
 * overwrite), rows with new ids are added alongside what's already there.
 * IndexedDB's key generator advances to stay past the highest explicit key
 * ever put to a store, so later auto-generated ids (new trips/items created
 * after an import) can't collide with restored ones.
 */
export async function restoreBackup(backup: BackupData): Promise<void> {
  // Decoded before the write transaction opens, so a photo that fails to
  // decode aborts the whole import with nothing written.
  const receiptsWithBlobs: PendingReceipt[] = await Promise.all(
    backup.tables.pendingReceipts.map(async ({ imageBlob, ...rest }) =>
      imageBlob === undefined ? rest : { ...rest, imageBlob: await dataUrlToBlob(imageBlob, rest.id) },
    ),
  )

  await db.transaction('rw', db.trips, db.items, db.categoryNotes, db.pendingReceipts, db.appState, async () => {
    await db.trips.bulkPut(backup.tables.trips)
    await db.items.bulkPut(backup.tables.items)
    await db.categoryNotes.bulkPut(backup.tables.categoryNotes)
    await db.pendingReceipts.bulkPut(receiptsWithBlobs)
    await db.appState.bulkPut(backup.tables.appState)
  })
}
