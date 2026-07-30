import { useEffect, useState } from 'react'

export function ReceiptThumbnail({ blob }: { blob: Blob }) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    const objectUrl = URL.createObjectURL(blob)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [blob])

  if (!url) return null

  return (
    <img
      src={url}
      alt="Receipt thumbnail"
      style={{
        width: 48,
        height: 48,
        objectFit: 'cover',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--border)',
        flexShrink: 0,
      }}
    />
  )
}
