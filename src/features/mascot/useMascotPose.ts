import { useEffect, useRef, useState } from 'react'
import { usePendingReceipt } from '../receipt-review/usePendingReceipt'

export type MascotPose = 'idle' | 'scanning' | 'happy'

// Long enough to register as a reaction, short enough not to overstay once
// the user's attention has already moved to the review panel.
const HAPPY_POSE_DURATION_MS = 1800

/**
 * scanning while a receipt is actively being extracted, a brief happy pulse
 * the moment a *new* done-and-unreviewed receipt shows up (extraction
 * succeeded, items are ready for review), idle otherwise. `isProcessing` is
 * passed in rather than derived here from another `useReceiptCapture()` call
 * — that hook also wires up the online-sync effect and stranded-processing
 * reclaim, which must stay singletons; this hook only needs the boolean its
 * caller already has.
 */
export function useMascotPose(isProcessing: boolean): MascotPose {
  const pendingReceipt = usePendingReceipt()
  const [showHappy, setShowHappy] = useState(false)
  const lastSeenReceiptId = useRef<number | null>(null)

  useEffect(() => {
    if (!pendingReceipt) {
      lastSeenReceiptId.current = null
      return
    }
    if (lastSeenReceiptId.current === pendingReceipt.id) return
    lastSeenReceiptId.current = pendingReceipt.id

    setShowHappy(true)
    const timeout = setTimeout(() => setShowHappy(false), HAPPY_POSE_DURATION_MS)
    return () => clearTimeout(timeout)
  }, [pendingReceipt])

  if (isProcessing) return 'scanning'
  if (showHappy) return 'happy'
  return 'idle'
}
