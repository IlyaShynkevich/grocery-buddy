import { db, type AppStateEntry, type CategoryNote, type Item, type PendingReceipt, type Trip } from './db'

/**
 * Emergency export/import so the user's history survives browser/PWA
 * troubleshooting (cache clearing, uninstall/reinstall, switching devices) —
 * everything lives only in IndexedDB otherwise, with no server-side copy.
 */

export const BACKUP_SCHEMA_VERSION = 1

/** pendingReceipts.imageBlob can't survive JSON.stringify — stored as a data URL instead, reconstructed on import. */
interface PendingReceiptExport extends Omit<PendingReceipt, 'imageBlob'> {
  imageBlob: string
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

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read a receipt image while building the backup'))
    reader.readAsDataURL(blob)
  })
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  // fetch() on a data: URL is a synchronous decode under the hood, not a
  // network request — works offline and is the simplest cross-browser way
  // back from a data URL to a Blob.
  const response = await fetch(dataUrl)
  return response.blob()
}

export async function buildBackup(): Promise<BackupData> {
  const [trips, items, categoryNotes, pendingReceipts, appState] = await Promise.all([
    db.trips.toArray(),
    db.items.toArray(),
    db.categoryNotes.toArray(),
    db.pendingReceipts.toArray(),
    db.appState.toArray(),
  ])

  const exportedReceipts = await Promise.all(
    pendingReceipts.map(async ({ imageBlob, ...rest }): Promise<PendingReceiptExport> => ({
      ...rest,
      imageBlob: await blobToDataUrl(imageBlob),
    })),
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

  return parsed as unknown as BackupData
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
  const receiptsWithBlobs: PendingReceipt[] = await Promise.all(
    backup.tables.pendingReceipts.map(async ({ imageBlob, ...rest }) => ({
      ...rest,
      imageBlob: await dataUrlToBlob(imageBlob),
    })),
  )

  await db.transaction('rw', db.trips, db.items, db.categoryNotes, db.pendingReceipts, db.appState, async () => {
    await db.trips.bulkPut(backup.tables.trips)
    await db.items.bulkPut(backup.tables.items)
    await db.categoryNotes.bulkPut(backup.tables.categoryNotes)
    await db.pendingReceipts.bulkPut(receiptsWithBlobs)
    await db.appState.bulkPut(backup.tables.appState)
  })
}
