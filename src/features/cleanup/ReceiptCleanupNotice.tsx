import { useEffect, useState } from 'react'
import { runReceiptCleanupOnce, type ReceiptCleanupResult } from '../../db/receiptCleanup'
import { useT } from '../../i18n'
import type { Messages } from '../../i18n/messages/en'
import { cardStyle, footnoteStyle, PAGE_MAX_WIDTH, space } from '../../lib/ui'

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
        ...footnoteStyle,
        display: 'flex',
        alignItems: 'flex-start',
        gap: space.md,
        width: `calc(100% - ${space.xl} * 2)`,
        maxWidth: `calc(${PAGE_MAX_WIDTH}px - ${space.xl} * 2)`,
        margin: `${space.lg} auto 0`,
        textAlign: 'left',
        // cardStyle's edge is a box-shadow ring, not a border, so the
        // failure state has to restate the whole shadow to turn that ring
        // red — overriding `borderColor` (as this did while cards had a
        // 1px border) would now silently do nothing and a cleanup failure
        // would read as an ordinary notice.
        ...(isError ? { boxShadow: '0 0 0 1px var(--danger)', color: 'var(--danger)' } : {}),
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
        style={{ padding: `${space.xs} ${space.md}`, lineHeight: 1, background: 'transparent', border: 'none', color: 'inherit' }}
      >
        ✕
      </button>
    </div>
  )
}
