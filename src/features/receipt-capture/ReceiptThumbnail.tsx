import { useEffect, useState, type CSSProperties } from 'react'
import { useT } from '../../i18n'

const BOX: CSSProperties = {
  width: 48,
  height: 48,
  borderRadius: 'var(--radius-sm)',
  boxShadow: '0 0 0 1px var(--separator)',
  flexShrink: 0,
}

/**
 * `blob` is absent only for an already-processed receipt restored from a
 * backup, which no longer carries photos (see PendingReceipt.imageBlob) — an
 * explicit "no photo" tile, not an empty gap or a broken image.
 */
export function ReceiptThumbnail({ blob, onLoad }: { blob?: Blob; onLoad?: () => void }) {
  const messages = useT()
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!blob) {
      setUrl(null)
      return
    }
    const objectUrl = URL.createObjectURL(blob)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [blob])

  if (!blob) {
    return (
      <div
        data-testid="receipt-thumbnail-missing"
        title={messages.capture.noPhotoTitle}
        style={{
          ...BOX,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          fontSize: '0.625rem',
          lineHeight: 1.1,
          color: 'var(--text-muted)',
        }}
      >
        {messages.capture.noPhoto}
      </div>
    )
  }

  if (!url) return null

  return (
    <img
      src={url}
      alt={messages.capture.thumbnailAlt}
      onLoad={onLoad}
      onError={() => console.error('Receipt thumbnail failed to load', { type: blob.type, size: blob.size })}
      style={{ ...BOX, objectFit: 'cover' }}
    />
  )
}
