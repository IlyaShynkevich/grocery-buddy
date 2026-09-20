import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { db } from '../../db/db'
import { useT } from '../../i18n'
import { formatBytes } from '../../lib/formatBytes'
import { calloutStyle, cardStyle, footnoteStyle, mutedTextStyle, numericStyle, space } from '../../lib/ui'
import { readBrowserUsage, readPhotoUsage, type BrowserUsage, type PhotoUsage } from './storageUsage'

function describeErr(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function Row({ label, value, testId, strong }: { label: string; value: string; testId: string; strong?: boolean }) {
  return (
    <div data-testid={testId} style={{ display: 'flex', justifyContent: 'space-between', gap: space.lg, fontWeight: strong ? 600 : undefined }}>
      <span>{label}</span>
      <span style={{ ...numericStyle, whiteSpace: 'nowrap' }}>{value}</span>
    </div>
  )
}

/**
 * How much space the app takes on this device: receipt photos (read from
 * the database, exact) against everything else (the browser's estimate).
 */
export function StorageSection() {
  const messages = useT()

  // Re-reads whenever trips, items, notes or receipts change, so the figures
  // stay current after e.g. a restore. Errors are caught here rather than
  // thrown into render (where they'd take the whole page down) and shown.
  const photos = useLiveQuery(async (): Promise<{ photos: PhotoUsage } | { error: string }> => {
    try {
      const [photos] = await Promise.all([readPhotoUsage(), db.trips.count(), db.items.count(), db.categoryNotes.count()])
      return { photos }
    } catch (err) {
      console.error('Grocery Buddy: could not read receipt photo sizes', err)
      return { error: describeErr(err) }
    }
  })

  const [browser, setBrowser] = useState<BrowserUsage | { kind: 'failed'; message: string } | null>(null)
  useEffect(() => {
    if (!photos || 'error' in photos) return
    let cancelled = false
    readBrowserUsage(photos.photos.bytes).then(
      (usage) => {
        if (!cancelled) setBrowser(usage)
      },
      (err) => {
        console.error('Grocery Buddy: the browser could not estimate storage use', err)
        if (!cancelled) setBrowser({ kind: 'failed', message: describeErr(err) })
      },
    )
    return () => {
      cancelled = true
    }
  }, [photos])

  const noteStyle = { ...footnoteStyle, ...mutedTextStyle, marginTop: space.sm }

  return (
    <section data-testid="storage-section" style={{ ...cardStyle, marginTop: space.lg }}>
      <h2 style={{ marginBottom: space.sm }}>{messages.storage.title}</h2>

      {!photos || (!('error' in photos) && !browser) ? (
        <p style={mutedTextStyle}>{messages.storage.loading}</p>
      ) : 'error' in photos ? (
        <p role="alert" data-testid="storage-error" style={{ color: 'var(--danger)' }}>
          {messages.storage.failed(photos.error)}
        </p>
      ) : (
        <div style={{ ...calloutStyle, display: 'flex', flexDirection: 'column', gap: space['2xs'] }}>
          {browser && (browser.kind === 'detailed' || browser.kind === 'total') && (
            <Row testId="storage-total" label={messages.storage.total} value={formatBytes(browser.total)} strong />
          )}
          <Row testId="storage-photos" label={messages.storage.photos(photos.photos.count)} value={formatBytes(photos.photos.bytes)} />
          {browser?.kind === 'detailed' && (
            <>
              <Row testId="storage-trip-data" label={messages.storage.tripData} value={formatBytes(browser.tripData)} />
              <Row testId="storage-app-files" label={messages.storage.appFiles} value={formatBytes(browser.appFiles)} />
            </>
          )}
          {browser?.kind === 'total' && <Row testId="storage-rest" label={messages.storage.rest} value={formatBytes(browser.rest)} />}

          {browser?.kind === 'failed' ? (
            <p role="alert" data-testid="storage-estimate-error" style={{ ...footnoteStyle, color: 'var(--danger)', marginTop: space.sm }}>
              {messages.storage.failed(browser.message)}
            </p>
          ) : (
            <p data-testid="storage-note" style={noteStyle}>
              {browser?.kind === 'unsupported' ? messages.storage.unsupported : messages.storage.estimateNote}
            </p>
          )}
        </div>
      )}
    </section>
  )
}
