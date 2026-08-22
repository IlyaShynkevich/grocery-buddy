import { useRef, useState, type ChangeEvent } from 'react'
import { BackupValidationError, backupFileName, buildBackup, downloadBackup, parseBackup, restoreBackup, type BackupData } from '../../db/backup'
import { cardStyle, dangerButtonStyle, dangerFilledButtonStyle, mutedTextStyle } from '../../lib/ui'

function describeErr(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function summarizeBackup(backup: BackupData): string {
  const { trips, items, categoryNotes, pendingReceipts } = backup.tables
  return `${trips.length} trip${trips.length === 1 ? '' : 's'}, ${items.length} item${items.length === 1 ? '' : 's'}, ${categoryNotes.length} note${categoryNotes.length === 1 ? '' : 's'}, ${pendingReceipts.length} pending receipt${pendingReceipts.length === 1 ? '' : 's'}`
}

/**
 * Export/import of the entire local database to a single JSON file — the
 * only way this app's data can survive things that wipe IndexedDB (clearing
 * site data, uninstall/reinstall, switching phones), since everything lives
 * client-side with no server-side copy. Import is a restore/merge (upsert by
 * id), never a silent wipe-and-replace: a validated file is held in
 * `pendingImport` and only actually written to Dexie once the user
 * explicitly confirms, same two-step confirm pattern TripDetailPage uses for
 * deleting a trip.
 */
export function BackupSection() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const [pendingImport, setPendingImport] = useState<{ backup: BackupData; fileName: string } | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [importSuccess, setImportSuccess] = useState<string | null>(null)

  const handleExport = async () => {
    setExportError(null)
    setExporting(true)
    try {
      const backup = await buildBackup()
      downloadBackup(backup, backupFileName())
    } catch (err) {
      console.error('Grocery Buddy: backup export failed', err)
      setExportError(describeErr(err))
    } finally {
      setExporting(false)
    }
  }

  const handleChooseFile = () => {
    setImportError(null)
    setImportSuccess(null)
    fileInputRef.current?.click()
  }

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    // Reset immediately so choosing the same file again still fires onChange.
    event.target.value = ''
    if (!file) return

    setImportError(null)
    setImportSuccess(null)
    try {
      const text = await file.text()
      const backup = parseBackup(text)
      setPendingImport({ backup, fileName: file.name })
    } catch (err) {
      console.error('Grocery Buddy: backup file validation failed', err)
      setImportError(err instanceof BackupValidationError ? err.message : describeErr(err))
    }
  }

  const handleConfirmRestore = async () => {
    if (!pendingImport) return
    setImporting(true)
    setImportError(null)
    try {
      await restoreBackup(pendingImport.backup)
      setImportSuccess(`Restored ${summarizeBackup(pendingImport.backup)} from ${pendingImport.fileName}.`)
      setPendingImport(null)
    } catch (err) {
      console.error('Grocery Buddy: backup restore failed', err)
      setImportError(describeErr(err))
    } finally {
      setImporting(false)
    }
  }

  return (
    <section data-testid="backup-section" style={{ ...cardStyle, marginBottom: '0.75rem' }}>
      <h2 style={{ fontSize: '1.05rem', marginBottom: '0.25rem' }}>Backup & restore</h2>
      <p style={{ ...mutedTextStyle, fontSize: '0.85rem', marginBottom: '0.6rem' }}>
        Your trips and history live only on this device. Export a backup before clearing browser
        data, uninstalling, or switching phones.
      </p>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button type="button" data-testid="backup-export-button" onClick={handleExport} disabled={exporting}>
          {exporting ? 'Exporting…' : '⬇️ Export data'}
        </button>
        <button type="button" data-testid="backup-import-button" onClick={handleChooseFile} disabled={importing}>
          ⬆️ Import data
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        data-testid="backup-import-input"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      {exportError && (
        <p role="alert" data-testid="backup-export-error" style={{ color: 'var(--danger)', marginTop: '0.6rem' }}>
          Export failed: {exportError}
        </p>
      )}

      {importError && (
        <p role="alert" data-testid="backup-import-error" style={{ color: 'var(--danger)', marginTop: '0.6rem' }}>
          Import failed: {importError}
        </p>
      )}

      {importSuccess && (
        <p data-testid="backup-import-success" style={{ marginTop: '0.6rem' }}>
          {importSuccess}
        </p>
      )}

      {pendingImport && (
        <div
          data-testid="backup-import-confirm"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--danger)',
            borderRadius: 'var(--radius)',
            padding: '0.6rem 0.75rem',
            marginTop: '0.6rem',
          }}
        >
          <p style={{ marginBottom: '0.6rem' }}>
            Restore <strong>{pendingImport.fileName}</strong>? It contains {summarizeBackup(pendingImport.backup)}. Any
            existing trip, item, note, or receipt with a matching id will be overwritten — this can't be undone.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              data-testid="backup-import-confirm-yes"
              onClick={handleConfirmRestore}
              disabled={importing}
              style={dangerFilledButtonStyle}
            >
              {importing ? 'Restoring…' : 'Yes, restore'}
            </button>
            <button
              type="button"
              data-testid="backup-import-confirm-cancel"
              onClick={() => setPendingImport(null)}
              disabled={importing}
              style={dangerButtonStyle}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
