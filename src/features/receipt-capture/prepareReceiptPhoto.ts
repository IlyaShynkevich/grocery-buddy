import { t } from '../../i18n'

/**
 * Longest side a stored receipt photo is kept at. Deliberately the same as
 * what the extraction request has always sent (larger never reaches the AI),
 * so shrinking at capture loses nothing extraction could use. Measured on a
 * 12.5MP camera photo: 3.8MB -> ~0.32MB stored, processing 975 -> 369ms and
 * its memory peak +67MB -> +15MB (the full-resolution decode now happens
 * once, at capture, instead of on every processing attempt).
 */
export const RECEIPT_PHOTO_MAX_DIMENSION = 1600
const JPEG_QUALITY = 0.85

/**
 * Returns a JPEG no larger than RECEIPT_PHOTO_MAX_DIMENSION on its longest
 * side. A JPEG already within that size is returned as-is — re-encoding it
 * would only lose quality (this is what lets a photo shrunk at capture be
 * uploaded later without a second lossy encode). Throws, with a message
 * naming the step that failed, rather than falling back to storing or
 * sending the original.
 */
export async function prepareReceiptPhoto(photo: Blob): Promise<Blob> {
  let bitmap: ImageBitmap
  try {
    // Honors EXIF orientation by default, so a portrait photo stays portrait.
    bitmap = await createImageBitmap(photo)
  } catch (err) {
    const messages = t().capture
    throw new Error(
      messages.unreadablePhoto(
        photo.type || messages.unknownType,
        (photo.size / 1e6).toFixed(1),
        err instanceof Error ? err.message : String(err),
      ),
    )
  }

  try {
    const scale = Math.min(1, RECEIPT_PHOTO_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
    if (scale === 1 && photo.type === 'image/jpeg') return photo

    const width = Math.round(bitmap.width * scale)
    const height = Math.round(bitmap.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error(t().capture.canvasUnsupported)
    ctx.drawImage(bitmap, 0, 0, width, height)

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => (result ? resolve(result) : reject(new Error(t().capture.encodeFailed(width, height)))),
        'image/jpeg',
        JPEG_QUALITY,
      )
    })
  } finally {
    bitmap.close()
  }
}
