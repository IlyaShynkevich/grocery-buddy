/** Reads a Blob as a base64 data: URL (for JSON transport — the extraction request body, backup files). */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error(`Failed to read a ${blob.type || 'binary'} blob (${blob.size} bytes)`))
    reader.readAsDataURL(blob)
  })
}
