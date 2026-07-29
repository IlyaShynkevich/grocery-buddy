import type { VercelRequest, VercelResponse } from '@vercel/node'
import { extractReceiptItems } from './_lib/groqExtract.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const image = (req.body as { image?: unknown } | null)?.image
  if (typeof image !== 'string' || !image.startsWith('data:image/')) {
    res.status(400).json({ error: 'Missing or invalid "image" data URL' })
    return
  }

  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    res.status(500).json({ error: 'Server is not configured with GROQ_API_KEY' })
    return
  }

  try {
    const items = await extractReceiptItems(image, apiKey)
    res.status(200).json({ items })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown extraction error'
    res.status(502).json({ error: message })
  }
}
