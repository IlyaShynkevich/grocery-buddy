import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import type { PendingReceipt, ReceiptStatus } from '../../db/db'
import { cardStyle, mutedTextStyle, pageStyle, primaryButtonStyle } from '../../lib/ui'
import { getUserFacingErrorMessage } from './errorMessage'
import { ReceiptThumbnail } from './ReceiptThumbnail'
import { useReceiptCapture } from './useReceiptCapture'

const STATUS_LABEL: Record<ReceiptStatus, string> = {
  pending: 'Waiting to process',
  processing: 'Processing…',
  failed: 'Failed — will retry',
  done: 'Processed',
}

export function ReceiptCapture() {
  const { pendingReceipts, captureReceipt, removeReceipt, processReceipt } = useReceiptCapture()
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      await captureReceipt(file)
    }
    // Reset so picking the same file again still fires a change event.
    event.target.value = ''
  }

  return (
    <section data-testid="receipt-capture" style={pageStyle}>
      <h2 style={{ fontSize: '1.1rem' }}>Receipt</h2>

      <label
        style={{
          display: 'inline-block',
          marginTop: '0.6rem',
          padding: '0.5rem 0.9rem',
          fontWeight: 600,
          background: 'var(--accent)',
          color: 'var(--accent-contrast)',
          border: '1px solid var(--accent)',
          borderRadius: 'var(--radius-sm)',
          cursor: 'pointer',
        }}
      >
        Take receipt photo
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          data-testid="receipt-capture-input"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
      </label>

      {pendingReceipts.length === 0 && (
        <p style={{ ...mutedTextStyle, marginTop: '0.75rem' }}>No receipts captured yet.</p>
      )}

      <ul
        style={{ listStyle: 'none', padding: 0, margin: '0.75rem 0 0', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}
        data-testid="receipt-list"
      >
        {pendingReceipts.map((receipt) => (
          <ReceiptRow
            key={receipt.id}
            receipt={receipt}
            onProcess={processReceipt}
            onRemove={removeReceipt}
          />
        ))}
      </ul>
    </section>
  )
}

function ReceiptRow({
  receipt,
  onProcess,
  onRemove,
}: {
  receipt: PendingReceipt
  onProcess: (receipt: PendingReceipt) => void
  onRemove: (id: number) => void
}) {
  const [now, setNow] = useState(() => Date.now())
  const isWaitingToRetry = receipt.status === 'failed' && receipt.retryAt !== undefined && receipt.retryAt > now

  // Tick the countdown display while a retry is scheduled.
  useEffect(() => {
    if (!isWaitingToRetry) return
    const interval = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(interval)
  }, [isWaitingToRetry])

  // Auto-retry once the scheduled time arrives. Re-fires whenever the
  // receipt or its retryAt change, so a second rate-limit failure (with a
  // new retryAt) reschedules itself the same way — no separate "repeat the
  // loop" logic needed, it falls out of normal React reactivity. Recomputing
  // `delay` from Date.now() each time means the frequent reschedules from
  // the countdown tick above are harmless — the remaining wait just keeps
  // shrinking towards zero.
  useEffect(() => {
    if (receipt.status !== 'failed' || receipt.retryAt === undefined) return
    const delay = Math.max(0, receipt.retryAt - Date.now())
    const timeout = setTimeout(() => onProcess(receipt), delay)
    return () => clearTimeout(timeout)
  }, [receipt, onProcess])

  const statusText = isWaitingToRetry
    ? `Retrying in ${Math.max(0, Math.ceil((receipt.retryAt! - now) / 1000))}s`
    : STATUS_LABEL[receipt.status]

  return (
    <li
      data-testid="receipt-item"
      data-status={receipt.status}
      style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: '0.75rem' }}
    >
      <ReceiptThumbnail blob={receipt.imageBlob} />
      <div style={{ flex: 1 }}>
        <div data-testid="receipt-status">{statusText}</div>
        <div style={{ ...mutedTextStyle, fontSize: '0.75rem' }}>{new Date(receipt.capturedAt).toLocaleString()}</div>
        {receipt.status === 'failed' && receipt.lastError && (
          <div data-testid="receipt-error" style={{ fontSize: '0.75rem', color: 'var(--danger)' }}>
            {getUserFacingErrorMessage(receipt.lastError)}
          </div>
        )}
      </div>
      {(receipt.status === 'pending' || receipt.status === 'failed') && (
        <button type="button" data-testid="receipt-process-button" onClick={() => onProcess(receipt)} style={primaryButtonStyle}>
          {receipt.status === 'failed' ? 'Retry' : 'Process'}
        </button>
      )}
      <button type="button" onClick={() => onRemove(receipt.id)} aria-label="Remove receipt" style={{ padding: '0.35rem 0.6rem', lineHeight: 1 }}>
        ✕
      </button>
    </li>
  )
}
