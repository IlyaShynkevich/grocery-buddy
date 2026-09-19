import { useEffect, useState } from 'react'
import { runReceiptCleanupOnce, type ReceiptCleanupResult } from '../../db/receiptCleanup'
import { useT } from '../../i18n'
import type { Messages } from '../../i18n/messages/en'
import { cardStyle, PAGE_MAX_WIDTH } from '../../lib/ui'

type NoticeState = { kind: 'done'; result: ReceiptCleanupResult } | { kind: 'error'; message: string } | null

function describe(messages: Messages, result: ReceiptCleanupResult): string {
  const parts: string[] = []
  if (result.removed > 0) parts.push(messages.cleanup.freed((result.freedBytes / 1e6).toFixed(1), result.removed))
  if (result.keptUnfinished > 0) parts.push(messages.cleanup.keptUnfinished(result.keptUnfinished))
  return parts.join(' ')
}

/**
 * Runs the one-time receipt cleanup (see receiptCleanup.ts) on app load and
 * says what it did. Shown only when it actually changed or found something;
 * a failure is always shown. Every outcome is also logged.
 */
export function ReceiptCleanupNotice() {
  const messages = useT()
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
          ? messages.cleanup.failed(notice.message)
          : describe(messages, notice.result)}
      </span>
      <button
        type="button"
        data-testid="receipt-cleanup-dismiss"
        aria-label={messages.common.dismiss}
        onClick={() => setNotice(null)}
        style={{ padding: '0.25rem 0.5rem', lineHeight: 1 }}
      >
        ✕
      </button>
    </div>
  )
}
