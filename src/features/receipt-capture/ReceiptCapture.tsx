import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import type { PendingReceipt, ReceiptStatus } from '../../db/db'
import { cardStyle, mutedTextStyle, pageStyle, primaryButtonStyle } from '../../lib/ui'
import { Mascot } from '../mascot/Mascot'
import { useMascotPose } from '../mascot/useMascotPose'
import { getUserFacingErrorMessage, isDemoModeError } from './errorMessage'
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
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const isProcessing = pendingReceipts.some((receipt) => receipt.status === 'processing')
  const mascotPose = useMascotPose(isProcessing)

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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }}>
        <div>
          <h2 style={{ fontSize: '1.1rem' }}>Receipt</h2>

          <div style={{ position: 'relative', display: 'inline-block', marginTop: '0.6rem' }}>
            <button
              type="button"
              data-testid="receipt-add-button"
              onClick={() => setMenuOpen((open) => !open)}
              style={{
                padding: '0.5rem 0.9rem',
                fontWeight: 600,
                background: 'var(--accent)',
                color: 'var(--accent-contrast)',
                border: '1px solid var(--accent)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              Add receipt photo
            </button>

            {menuOpen && (
              <>
                {/* Invisible backdrop — closes the menu on outside click/tap. */}
                <div
                  onClick={() => setMenuOpen(false)}
                  style={{ position: 'fixed', inset: 0, zIndex: 1 }}
                />
                <div
                  data-testid="receipt-source-menu"
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 0.4rem)',
                    left: 0,
                    zIndex: 2,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.35rem',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                    padding: '0.4rem',
                    minWidth: '13rem',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
                  }}
                >
                  <button
                    type="button"
                    data-testid="receipt-camera-option"
                    onClick={() => {
                      setMenuOpen(false)
                      cameraInputRef.current?.click()
                    }}
                    style={{ textAlign: 'left', width: '100%' }}
                  >
                    📷 Camera
                  </button>
                  <button
                    type="button"
                    data-testid="receipt-gallery-option"
                    onClick={() => {
                      setMenuOpen(false)
                      galleryInputRef.current?.click()
                    }}
                    style={{ textAlign: 'left', width: '100%' }}
                  >
                    🖼️ Choose from Photos
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        <Mascot pose={mascotPose} />
      </div>

      {/*
        Two inputs, not one: `capture="environment"` is the only reliable
        cross-browser way to force the native camera app open directly, and
        it has to be present at trigger time — toggling it on/off the same
        input is flaky on mobile Safari. Omitting `capture` entirely is the
        standard way to get the OS photo/gallery picker instead. Both feed
        the exact same handleFileChange -> captureReceipt pipeline, so
        there's no divergence downstream of the input itself.
      */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        data-testid="receipt-capture-input"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        data-testid="receipt-gallery-input"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

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

  // Demo mode (no OPENAI_API_KEY on this deployment) isn't really a
  // "failure" — no auto-retry gets scheduled for it either (see
  // useReceiptCapture.ts), so the alarming red error styling and the
  // "will retry" wording would both be misleading here.
  const demoMode = receipt.status === 'failed' && receipt.lastError !== undefined && isDemoModeError(receipt.lastError)

  const statusText = isWaitingToRetry
    ? `Retrying in ${Math.max(0, Math.ceil((receipt.retryAt! - now) / 1000))}s`
    : demoMode
      ? 'Demo mode'
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
        <div data-testid="receipt-timestamp" style={{ ...mutedTextStyle, fontSize: '0.75rem' }}>
          {new Date(receipt.capturedAt).toLocaleString()}
        </div>
        {receipt.status === 'failed' && receipt.lastError && (
          <div data-testid="receipt-error" style={{ fontSize: '0.75rem', color: demoMode ? 'var(--text-muted)' : 'var(--danger)' }}>
            {getUserFacingErrorMessage(receipt.lastError, receipt.lastErrorStatus)}
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
