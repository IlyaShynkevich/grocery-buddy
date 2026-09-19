import { useEffect, useState } from 'react'
import { runReceiptCleanupOnce, type ReceiptCleanupResult } from '../../db/receiptCleanup'
import { cardStyle, PAGE_MAX_WIDTH } from '../../lib/ui'

type NoticeState = { kind: 'done'; result: ReceiptCleanupResult } | { kind: 'error'; message: string } | null

function describe(result: ReceiptCleanupResult): string {
  const parts: string[] = []
  if (result.removed > 0) {
    const mb = (result.freedBytes / 1e6).toFixed(1)
    parts.push(
      `Freed ${mb} MB: removed ${result.removed} receipt photo${result.removed === 1 ? '' : 's'} from saved trips — they're no longer needed once a trip is saved.`,
    )
  }
  if (result.keptUnfinished > 0) {
    parts.push(
      `Left ${result.keptUnfinished} receipt${result.keptUnfinished === 1 ? '' : 's'} on saved trips untouched, because ${result.keptUnfinished === 1 ? 'it was' : 'they were'} never fully processed.`,
    )
  }
  return parts.join(' ')
}

/**
 * Runs the one-time receipt cleanup (see receiptCleanup.ts) on app load and
 * says what it did. Shown only when it actually changed or found something;
 * a failure is always shown. Every outcome is also logged.
 */
export function ReceiptCleanupNotice() {
  const [notice, setNotice] = useState<NoticeState>(null)

  useEffect(() => {
    runReceiptCleanupOnce().then(
      (result) => {
        if (result === null) return // already ran on an earlier load
        console.info('Grocery Buddy: one-time receipt cleanup finished', result)
        if (result.removed > 0 || result.keptUnfinished > 0) setNotice({ kind: 'done', result })
      },
      (err: unknown) => {
        console.error('RECEIPT_CLEANUP_ERROR:', err)
        setNotice({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
      },
    )
  }, [])

  if (!notice) return null

  const isError = notice.kind === 'error'
  return (
    <div
      role={isError ? 'alert' : 'status'}
      data-testid={isError ? 'receipt-cleanup-error' : 'receipt-cleanup-notice'}
      style={{
        ...cardStyle,
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.6rem',
        width: 'calc(100% - 2rem)',
        maxWidth: `calc(${PAGE_MAX_WIDTH}px - 2rem)`,
        margin: '0.75rem auto 0',
        fontSize: '0.85rem',
        textAlign: 'left',
        ...(isError ? { borderColor: 'var(--danger)', color: 'var(--danger)' } : {}),
      }}
    >
      <span style={{ flex: 1 }}>
        {isError
          ? `Couldn't clear old receipt photos: ${notice.message}. Nothing was deleted — it will try again next time the app opens.`
          : describe(notice.result)}
      </span>
      <button
        type="button"
        data-testid="receipt-cleanup-dismiss"
        aria-label="Dismiss"
        onClick={() => setNotice(null)}
        style={{ padding: '0.25rem 0.5rem', lineHeight: 1 }}
      >
        ✕
      </button>
    </div>
  )
}
