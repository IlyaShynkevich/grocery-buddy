import { useEffect, useRef, useState } from 'react'
import { usePendingReceipt } from '../receipt-review/usePendingReceipt'
import { useActiveTripId } from '../trip/useActiveTripId'

export type MascotPose = 'idle' | 'scanning' | 'happy' | 'error' | 'thumbsup' | 'thankyou' | 'excited' | 'onit' | 'receiptfound'

/**
 * scanning while a receipt is actively being extracted, happy once
 * extraction succeeds (a done-and-unreviewed receipt shows up) — and happy
 * *stays* until the trip is saved, not a brief pulse. If another receipt
 * gets captured and processed while already happy (e.g. a second scan),
 * scanning takes priority for that window and it reverts to happy once that
 * one finishes too — reviewing/dismissing the panel does not clear it,
 * only actually saving the trip (a new active tripId) does, since that's
 * the point a fresh, not-yet-successful trip begins.
 *
 * error shows whenever a receipt is sitting in 'failed' status, but only
 * once neither scanning nor happy applies — a failed earlier receipt
 * shouldn't cover up an in-flight or just-succeeded one alongside it.
 *
 * `isProcessing` and `hasFailed` are passed in rather than derived here
 * from another `useReceiptCapture()` call — that hook also wires up the
 * online-sync effect and stranded-processing reclaim, which must stay
 * singletons; this hook only needs the booleans its caller already has.
 */
export function useMascotPose(isProcessing: boolean, hasFailed: boolean): MascotPose {
  const tripId = useActiveTripId()
  const pendingReceipt = usePendingReceipt()
  const [showHappy, setShowHappy] = useState(false)
  const lastSeenReceiptId = useRef<number | null>(null)
  const lastTripId = useRef(tripId)

  useEffect(() => {
    if (tripId === lastTripId.current) return
    lastTripId.current = tripId
    setShowHappy(false)
    lastSeenReceiptId.current = null
  }, [tripId])

  useEffect(() => {
    if (!pendingReceipt) return
    if (lastSeenReceiptId.current === pendingReceipt.id) return
    lastSeenReceiptId.current = pendingReceipt.id
    setShowHappy(true)
  }, [pendingReceipt])

  if (isProcessing) return 'scanning'
  if (showHappy) return 'happy'
  if (hasFailed) return 'error'
  return 'idle'
}
