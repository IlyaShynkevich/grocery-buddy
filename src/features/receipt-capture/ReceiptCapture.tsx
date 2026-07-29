import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import type { PendingReceipt, ReceiptStatus } from '../../db/db'
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
    <section
      data-testid="receipt-capture"
      style={{ maxWidth: 480, margin: '0 auto', padding: '1rem', textAlign: 'left' }}
    >
      <h2 style={{ fontSize: '1.2rem' }}>Receipt</h2>

      <label
        style={{
          display: 'inline-block',
          padding: '0.6rem 1rem',
          fontSize: '1rem',
          border: '1px solid #2e7d32',
          borderRadius: 4,
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
        <p style={{ opacity: 0.6, marginTop: '0.75rem' }}>No receipts captured yet.</p>
      )}

      <ul style={{ listStyle: 'none', padding: 0, margin: '0.75rem 0 0' }} data-testid="receipt-list">
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
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0.5rem 0',
        borderBottom: '1px solid #e0e0e0',
      }}
    >
      <ReceiptThumbnail blob={receipt.imageBlob} />
      <div style={{ flex: 1 }}>
        <div data-testid="receipt-status">{statusText}</div>
        <div style={{ fontSize: '0.75rem', opacity: 0.6 }}>
          {new Date(receipt.capturedAt).toLocaleString()}
        </div>
        {receipt.status === 'failed' && receipt.lastError && (
          <div data-testid="receipt-error" style={{ fontSize: '0.75rem', color: '#c62828' }}>
            {getUserFacingErrorMessage(receipt.lastError)}
          </div>
        )}
      </div>
      {(receipt.status === 'pending' || receipt.status === 'failed') && (
        <button type="button" data-testid="receipt-process-button" onClick={() => onProcess(receipt)}>
          {receipt.status === 'failed' ? 'Retry' : 'Process'}
        </button>
      )}
      <button type="button" onClick={() => onRemove(receipt.id)} aria-label="Remove receipt">
        ✕
      </button>
    </li>
  )
}
