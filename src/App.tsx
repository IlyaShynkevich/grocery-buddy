import { useEffect, useRef, useState } from 'react'
import { DbDebugPanel } from './features/debug/DbDebugPanel'
import { Footer } from './features/footer/Footer'
import { HistoryPage } from './features/history/HistoryPage'
import { TripDetailPage } from './features/history/TripDetailPage'
import { ReceiptCapture } from './features/receipt-capture/ReceiptCapture'
import { ReceiptReviewPanel } from './features/receipt-review/ReceiptReviewPanel'
import { ShoppingListPage } from './features/shopping-list/ShoppingListPage'
import { StatsPage } from './features/stats/StatsPage'
import { PAGE_MAX_WIDTH } from './lib/ui'

type View = { name: 'shopping' } | { name: 'history' } | { name: 'trip-detail'; tripId: number } | { name: 'stats' }

const TABS: Array<{ name: View['name']; label: string; testId: string }> = [
  { name: 'shopping', label: 'Shopping List', testId: 'nav-shopping' },
  { name: 'history', label: 'History', testId: 'nav-history' },
  { name: 'stats', label: 'Stats', testId: 'nav-stats' },
]

// Single source of truth for swipe order, shared with the tab bar above.
const TAB_ORDER = TABS.map((tab) => tab.name)

// Minimum horizontal travel (px) before a gesture counts as an intentional
// swipe, versus being e.g. a static tap or a proceeded-but-quickly-released
// touch that shouldn't switch tabs.
const SWIPE_MIN_DISTANCE = 50
// Travel (px) before a gesture commits to being horizontal vs. vertical —
// below this, direction is still ambiguous and the gesture is left alone.
const SWIPE_DIRECTION_LOCK = 10

function App() {
  const [view, setView] = useState<View>({ name: 'shopping' })
  // trip-detail isn't its own tab — it's reached via History, so it keeps
  // the History tab highlighted rather than showing no active tab at all.
  const activeTab = view.name === 'trip-detail' ? 'history' : view.name
  const mainRef = useRef<HTMLElement>(null)

  // Swipe-to-switch-tabs: left advances (Shopping List -> History -> Stats),
  // right goes back, no wraparound past either end. Raw touch events only
  // (not pointer/mouse) so this can't misfire from mouse-drag interactions
  // and genuinely reflects touch gestures on real devices. A gesture only
  // "commits" to being a horizontal swipe once it has moved past
  // SWIPE_DIRECTION_LOCK px more horizontally than vertically; until then
  // (or if it turns out to be more vertical) it's left completely alone, so
  // normal vertical scrolling is never hijacked. Touches starting on an
  // interactive element (buttons, inputs, the tab bar itself, the receipt
  // source-picker menu) are ignored from the start, so tapping/typing keeps
  // working exactly as before — this is purely an additional input path.
  useEffect(() => {
    const el = mainRef.current
    if (!el) return

    let startX = 0
    let startY = 0
    let phase: 'idle' | 'pending' | 'horizontal' | 'ignored' = 'idle'

    const isInteractive = (target: EventTarget | null) =>
      target instanceof Element && !!target.closest('button, a, input, textarea, select')

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1 || isInteractive(e.target)) {
        phase = 'ignored'
        return
      }
      phase = 'pending'
      startX = e.touches[0].clientX
      startY = e.touches[0].clientY
    }

    const onTouchMove = (e: TouchEvent) => {
      if (phase === 'ignored' || e.touches.length !== 1) return
      const dx = e.touches[0].clientX - startX
      const dy = e.touches[0].clientY - startY

      if (phase === 'pending') {
        if (Math.abs(dx) < SWIPE_DIRECTION_LOCK && Math.abs(dy) < SWIPE_DIRECTION_LOCK) return
        phase = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'ignored'
      }

      // Once committed to a horizontal swipe, stop the browser from also
      // rubber-banding/panning the page horizontally underneath the gesture.
      if (phase === 'horizontal') e.preventDefault()
    }

    const onTouchEnd = (e: TouchEvent) => {
      const wasHorizontal = phase === 'horizontal'
      phase = 'idle'
      if (!wasHorizontal) return

      const dx = e.changedTouches[0].clientX - startX
      if (Math.abs(dx) < SWIPE_MIN_DISTANCE) return

      const currentIndex = TAB_ORDER.indexOf(activeTab as View['name'])
      if (currentIndex === -1) return // e.g. trip detail — not one of the 3 swipeable tabs
      const nextIndex = currentIndex + (dx < 0 ? 1 : -1)
      if (nextIndex < 0 || nextIndex >= TAB_ORDER.length) return // no wraparound at the edges
      setView({ name: TAB_ORDER[nextIndex] } as View)
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd)
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
    }
  }, [activeTab])

  return (
    // A column flex layout at least one viewport tall, combined with the
    // footer's own marginTop: 'auto' (see Footer.tsx), pins the footer to
    // the true bottom of the screen — flush against the last content item
    // when content overflows the viewport, pushed down to the bottom edge
    // via the flex auto-margin when it doesn't. This also incidentally
    // keeps the earlier flow-root fix: a flex container is its own block
    // formatting context too, so <nav>'s top margin still can't collapse
    // through main/#root/body and leak above the viewport.
    <main
      ref={mainRef}
      // touch-action: pan-y leaves native vertical scrolling to the browser
      // but stops it from also claiming horizontal panning, so our JS swipe
      // handling above isn't fighting the browser for the same gesture.
      style={{ display: 'flex', flexDirection: 'column', minHeight: '100svh', touchAction: 'pan-y' }}
    >
      <nav
        data-testid="app-nav"
        style={{
          display: 'flex',
          gap: '0.25rem',
          maxWidth: PAGE_MAX_WIDTH,
          margin: '0.75rem auto 0',
          padding: '0 1rem 0.75rem',
          borderBottom: '1px solid var(--border)',
        }}
      >
        {TABS.map((tab) => {
          const active = tab.name === activeTab
          return (
            <button
              key={tab.name}
              type="button"
              data-testid={tab.testId}
              onClick={() => setView({ name: tab.name } as View)}
              style={{
                background: active ? 'var(--accent)' : 'transparent',
                color: active ? 'var(--accent-contrast)' : 'inherit',
                borderColor: active ? 'var(--accent)' : 'transparent',
                fontWeight: active ? 600 : 400,
              }}
            >
              {tab.label}
            </button>
          )
        })}
      </nav>

      {view.name === 'shopping' && (
        <>
          <ShoppingListPage />
          <ReceiptReviewPanel />
          <ReceiptCapture />
        </>
      )}

      {view.name === 'history' && (
        <HistoryPage onSelectTrip={(tripId) => setView({ name: 'trip-detail', tripId })} />
      )}

      {view.name === 'trip-detail' && (
        <TripDetailPage tripId={view.tripId} onBack={() => setView({ name: 'history' })} />
      )}

      {view.name === 'stats' && <StatsPage />}

      {/*
        Debug tools + footer are one bottom-anchored group, not two
        independently-pinned pieces — marginTop: 'auto' on the group (not
        on the footer alone) is what makes them sit flush together at the
        true bottom of the viewport on short pages, with the actual page
        content above filling the rest of the space.
      */}
      <div style={{ marginTop: 'auto' }}>
        <DbDebugPanel />
        <Footer />
      </div>
    </main>
  )
}

export default App
