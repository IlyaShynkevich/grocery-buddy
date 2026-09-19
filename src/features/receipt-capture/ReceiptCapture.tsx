import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import type { PendingReceipt, ReceiptStatus } from '../../db/db'
import { IconChip } from '../../lib/IconChip'
import { cardStyle, mutedTextStyle, pageStyle, primaryButtonStyle } from '../../lib/ui'
import { Mascot } from '../mascot/Mascot'
import { useMascotPose } from '../mascot/useMascotPose'
import { perfArmNextReceipt, perfMark, perfNewReceiptMilestone } from '../perf/perfLog'
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
  // 'waiting' from tapping Camera/Photos until the photo arrives (or the
  // picker is cancelled) — handing off to the camera app and back can take
  // several seconds on a real phone before the page gets the photo at all.
  // 'preparing' from then until the shrunk copy is saved (see
  // prepareReceiptPhoto): decoding a full-resolution photo takes up to ~1s
  // on a 50MP one. Without these, nothing on screen changes during either
  // gap and the app looks frozen.
  const [photoPhase, setPhotoPhase] = useState<'waiting' | 'preparing' | null>(null)
  const [captureError, setCaptureError] = useState<string | null>(null)
  const isProcessing = pendingReceipts.some((receipt) => receipt.status === 'processing')
  const hasFailed = pendingReceipts.some((receipt) => receipt.status === 'failed')
  const mascotPose = useMascotPose(isProcessing || photoPhase === 'preparing', hasFailed)

  // The picker/camera being dismissed without a photo fires `cancel` on the
  // input (Chrome 113+, Safari 16.4+) and no `change` — React has no prop
  // for it on <input>, so it's wired natively.
  useEffect(() => {
    const inputs = [cameraInputRef.current, galleryInputRef.current].filter((input) => input !== null)
    const onCancel = () => {
      perfMark('photo picker cancelled')
      setPhotoPhase((phase) => (phase === 'waiting' ? null : phase))
    }
    inputs.forEach((input) => input.addEventListener('cancel', onCancel))
    return () => inputs.forEach((input) => input.removeEventListener('cancel', onCancel))
  }, [])

  const openPicker = (input: HTMLInputElement | null, perfLabel: string) => {
    setMenuOpen(false)
    if (!input) {
      console.error('Receipt capture: photo input is not mounted')
      setCaptureError('The photo picker is not available — reload the app and try again.')
      return
    }
    perfMark(perfLabel)
    setCaptureError(null)
    setPhotoPhase('waiting')
    input.click()
  }

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target
    const file = input.files?.[0]
    try {
      if (!file) {
        perfMark('photo picker returned no file')
        return
      }
      perfMark(`photo received (${(file.size / 1e6).toFixed(1)} MB, ${file.type || 'unknown type'})`)
      setCaptureError(null)
      setPhotoPhase('preparing')
      perfArmNextReceipt()
      await captureReceipt(file)
      perfMark('photo saved')
    } catch (err) {
      console.error('RECEIPT_CAPTURE_ERROR:', err)
      setCaptureError(`Photo not saved: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setPhotoPhase(null)
      // Reset so picking the same file again still fires a change event.
      input.value = ''
    }
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
                    onClick={() => openPicker(cameraInputRef.current, 'Camera tap')}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', textAlign: 'left', width: '100%' }}
                  >
                    <IconChip src="/icons/icon-camera.png" />
                    Camera
                  </button>
                  <button
                    type="button"
                    data-testid="receipt-gallery-option"
                    onClick={() => openPicker(galleryInputRef.current, 'Photos tap')}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', textAlign: 'left', width: '100%' }}
                  >
                    <IconChip src="/icons/icon-gallery.png" />
                    Choose from Photos
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

      {captureError && (
        <p role="alert" data-testid="receipt-capture-error" style={{ color: 'var(--danger)', marginTop: '0.75rem' }}>
          {captureError}
        </p>
      )}

      {photoPhase && (
        <div
          role="status"
          data-testid={photoPhase === 'waiting' ? 'receipt-waiting-for-photo' : 'receipt-preparing-photo'}
          style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.75rem' }}
        >
          <span className="gb-pulse" style={{ flex: 1 }}>
            {photoPhase === 'waiting' ? 'Waiting for photo…' : 'Preparing photo…'}
          </span>
          {/* Safety valve for browsers that never fire `cancel`: only hides
              this indicator — a photo that still arrives is saved as usual.
              Not offered while preparing: that's already the photo being
              saved, and it ends on its own either way (saved or an error). */}
          {photoPhase === 'waiting' && (
            <button
              type="button"
              data-testid="receipt-waiting-dismiss"
              aria-label="Stop waiting for photo"
              onClick={() => setPhotoPhase(null)}
              style={{ padding: '0.35rem 0.6rem', lineHeight: 1 }}
            >
              ✕
            </button>
          )}
        </div>
      )}

      {pendingReceipts.length === 0 && !photoPhase && (
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

  useEffect(() => {
    perfNewReceiptMilestone('row', receipt.capturedAt, 'row shown')
  }, [receipt.capturedAt])

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
      <ReceiptThumbnail
        blob={receipt.imageBlob}
        onLoad={() => perfNewReceiptMilestone('thumbnail', receipt.capturedAt, 'thumbnail loaded')}
      />
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
        <button
          type="button"
          data-testid="receipt-process-button"
          onClick={() => {
            perfMark(receipt.status === 'failed' ? 'Retry tap' : 'Process tap')
            onProcess(receipt)
          }}
          style={primaryButtonStyle}
        >
          {receipt.status === 'failed' ? 'Retry' : 'Process'}
        </button>
      )}
      <button type="button" onClick={() => onRemove(receipt.id)} aria-label="Remove receipt" style={{ padding: '0.35rem 0.6rem', lineHeight: 1 }}>
        ✕
      </button>
    </li>
  )
}
