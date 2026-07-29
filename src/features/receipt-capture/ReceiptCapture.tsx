import { useRef, type ChangeEvent } from 'react'
import type { ReceiptStatus } from '../../db/db'
import { ReceiptThumbnail } from './ReceiptThumbnail'
import { useReceiptCapture } from './useReceiptCapture'

const STATUS_LABEL: Record<ReceiptStatus, string> = {
  pending: 'Waiting to process',
  processing: 'Processing…',
  failed: 'Failed — will retry',
  done: 'Processed',
}

export function ReceiptCapture() {
  const { pendingReceipts, captureReceipt, removeReceipt } = useReceiptCapture()
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
          <li
            key={receipt.id}
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
              <div data-testid="receipt-status">{STATUS_LABEL[receipt.status]}</div>
              <div style={{ fontSize: '0.75rem', opacity: 0.6 }}>
                {new Date(receipt.capturedAt).toLocaleString()}
              </div>
            </div>
            <button type="button" onClick={() => removeReceipt(receipt.id)} aria-label="Remove receipt">
              ✕
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
