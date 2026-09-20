import { useRef, useState, type ChangeEvent } from 'react'
import { BackupValidationError, backupFileName, buildBackup, downloadBackup, parseBackup, restoreBackup, type BackupData } from '../../db/backup'
import { useT } from '../../i18n'
import type { Messages } from '../../i18n/messages/en'
import { IconChip } from '../../lib/IconChip'
import { cardStyle, dangerButtonStyle, dangerFilledButtonStyle, footnoteStyle, mutedTextStyle, space } from '../../lib/ui'

function describeErr(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function summarizeBackup(messages: Messages, backup: BackupData): string {
  const { trips, items, categoryNotes, pendingReceipts } = backup.tables
  return messages.backup.summary({
    trips: trips.length,
    items: items.length,
    notes: categoryNotes.length,
    receipts: pendingReceipts.length,
    withPhotos: pendingReceipts.filter((receipt) => receipt.imageBlob !== undefined).length,
  })
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
  const messages = useT()
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
      setImportSuccess(messages.backup.restored(summarizeBackup(messages, pendingImport.backup), pendingImport.fileName))
      setPendingImport(null)
    } catch (err) {
      console.error('Grocery Buddy: backup restore failed', err)
      setImportError(describeErr(err))
    } finally {
      setImporting(false)
    }
  }

  return (
    <section data-testid="backup-section" style={{ ...cardStyle, marginTop: space.lg }}>
      <h2>{messages.backup.title}</h2>
      <p style={{ ...footnoteStyle, ...mutedTextStyle, margin: `${space.xs} 0 ${space.lg}` }}>{messages.backup.intro}</p>

      <div style={{ display: 'flex', gap: space.md, flexWrap: 'wrap' }}>
        <button
          type="button"
          data-testid="backup-export-button"
          onClick={handleExport}
          disabled={exporting}
          style={{ display: 'flex', alignItems: 'center', gap: space.md }}
        >
          <IconChip src="/icons/icon-export.png" />
          {exporting ? messages.backup.exporting : messages.backup.exportData}
        </button>
        <button
          type="button"
          data-testid="backup-import-button"
          onClick={handleChooseFile}
          disabled={importing}
          style={{ display: 'flex', alignItems: 'center', gap: space.md }}
        >
          <IconChip src="/icons/icon-import.png" />
          {messages.backup.importData}
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
        <p role="alert" data-testid="backup-export-error" style={{ ...footnoteStyle, color: 'var(--danger)', marginTop: space.md }}>
          {messages.backup.exportFailed(exportError)}
        </p>
      )}

      {importError && (
        <p role="alert" data-testid="backup-import-error" style={{ ...footnoteStyle, color: 'var(--danger)', marginTop: space.md }}>
          {messages.backup.importFailed(importError)}
        </p>
      )}

      {importSuccess && (
        <p data-testid="backup-import-success" style={{ ...footnoteStyle, marginTop: space.md }}>
          {importSuccess}
        </p>
      )}

      {pendingImport && (
        <div
          data-testid="backup-import-confirm"
          style={{
            background: 'var(--bg)',
            border: '1px solid var(--danger)',
            borderRadius: 'var(--radius)',
            padding: `${space.lg} ${space.lg}`,
            marginTop: space.md,
          }}
        >
          <p style={{ marginBottom: space.lg }}>
            {messages.backup.confirmRestore(pendingImport.fileName, summarizeBackup(messages, pendingImport.backup))}
          </p>
          <div style={{ display: 'flex', gap: space.md }}>
            <button
              type="button"
              data-testid="backup-import-confirm-yes"
              onClick={handleConfirmRestore}
              disabled={importing}
              style={dangerFilledButtonStyle}
            >
              {importing ? messages.backup.restoring : messages.backup.yesRestore}
            </button>
            <button
              type="button"
              data-testid="backup-import-confirm-cancel"
              onClick={() => setPendingImport(null)}
              disabled={importing}
              style={dangerButtonStyle}
            >
              {messages.common.cancel}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
