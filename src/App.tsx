import { useEffect, useRef, useState, type ReactNode } from 'react'
import { DbDebugPanel } from './features/debug/DbDebugPanel'
import { Footer } from './features/footer/Footer'
import { HistoryPage } from './features/history/HistoryPage'
import { TripDetailPage } from './features/history/TripDetailPage'
import { TabTransition, type SlideDirection } from './features/navigation/TabTransition'
import { ReceiptCapture } from './features/receipt-capture/ReceiptCapture'
import { ReceiptReviewPanel } from './features/receipt-review/ReceiptReviewPanel'
import { ShoppingListPage } from './features/shopping-list/ShoppingListPage'
import { StatsPage } from './features/stats/StatsPage'
import { PAGE_MAX_WIDTH } from './lib/ui'

type View = { name: 'shopping' } | { name: 'history' } | { name: 'trip-detail'; tripId: number } | { name: 'stats' }
type TabName = Exclude<View['name'], 'trip-detail'>

const TABS: Array<{ name: TabName; label: string; testId: string }> = [
  { name: 'shopping', label: 'Shopping List', testId: 'nav-shopping' },
  { name: 'history', label: 'History', testId: 'nav-history' },
  { name: 'stats', label: 'Stats', testId: 'nav-stats' },
]

// Single source of truth for swipe/tab order, shared with the tab bar above.
const TAB_ORDER: TabName[] = TABS.map((tab) => tab.name)

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
  // Which way the last tab switch happened, for TabTransition's slide
  // direction — updated by both the swipe handler and the tab-bar taps
  // below, so either input path gets the same directional animation.
  const [direction, setDirection] = useState<SlideDirection>('forward')
  // Lags `activeTab` on purpose: only updates once a transition genuinely
  // finishes (TabTransition's onSettle), not the instant one starts. Debug
  // tools is gated on this, not `activeTab` directly — Stats is the only
  // tab that hides it, and gating on `activeTab` made it pop in/out mid-
  // transition (the moment a swipe/tap fires, before the slide has even
  // started), adding an extra, slide-unrelated layout jump on top of the
  // panels' own height animation.
  const [settledTab, setSettledTab] = useState<TabName>(activeTab)

  // Swipe-to-switch-tabs: left advances (Shopping List -> History -> Stats),
  // right goes back, no wraparound past either end. Raw touch events only
  // (not pointer/mouse) so this can't misfire from mouse-drag interactions
  // and genuinely reflects touch gestures on real devices. A gesture only
  // "commits" to being a horizontal swipe once it has moved past
  // SWIPE_DIRECTION_LOCK px more horizontally than vertically; until then
  // (or if it turns out to be more vertical) it's left completely alone, so
  // normal vertical scrolling is never hijacked. Touches starting on a
  // native form control (input, textarea, select) are ignored from the
  // start, since those need full native touch ownership (text cursor
  // placement, the native select picker). Buttons/links are deliberately
  // NOT excluded — a content-dense list (e.g. History with many trips) is
  // mostly covered edge-to-edge by row buttons, so excluding them meant a
  // swipe starting "on the list" almost never registered. This is safe: a
  // real tap (no meaningful movement) still reaches the element's own click
  // handler untouched, since nothing here calls preventDefault() on
  // touchstart/touchend for a non-swipe touch; a genuine horizontal drag
  // naturally won't also fire that element's click, per standard mobile
  // "tap slop" behavior (movement past a small threshold before release
  // suppresses the synthesized click) — independent of anything here.
  useEffect(() => {
    const el = mainRef.current
    if (!el) return

    let startX = 0
    let startY = 0
    let phase: 'idle' | 'pending' | 'horizontal' | 'ignored' = 'idle'

    const isInteractive = (target: EventTarget | null) =>
      target instanceof Element && !!target.closest('input, textarea, select')

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
        if (Math.abs(dx) < SWIPE_DIRECTION_LOCK && Math.abs(dy) < SWIPE_DIRECTION_LOCK) {
          // Direction isn't decided yet, but on a page tall enough to
          // actually scroll, touch-action: pan-y lets the browser commit to
          // a native vertical scroll from an early touchmove — it doesn't
          // wait for the lock threshold below, and once it commits,
          // preventDefault() on later touchmove events in the same gesture
          // is ignored. Speculatively preventing default here (whenever this
          // move is at least as horizontal as vertical) keeps the swipe
          // option alive through the ambiguous window; if it resolves to
          // vertical below, we just stop calling it and the browser's normal
          // scroll takes over a few px behind, which is imperceptible.
          if (Math.abs(dx) >= Math.abs(dy)) e.preventDefault()
          return
        }
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

      const currentIndex = TAB_ORDER.indexOf(activeTab)
      if (currentIndex === -1) return // e.g. trip detail — not one of the 3 swipeable tabs
      const swipeDirection: SlideDirection = dx < 0 ? 'forward' : 'backward'
      const nextIndex = currentIndex + (swipeDirection === 'forward' ? 1 : -1)
      if (nextIndex < 0 || nextIndex >= TAB_ORDER.length) return // no wraparound at the edges
      setDirection(swipeDirection)
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

  const renderTab = (tab: TabName): ReactNode => {
    switch (tab) {
      case 'shopping':
        return (
          <>
            <ShoppingListPage />
            <ReceiptReviewPanel />
            <ReceiptCapture />
          </>
        )
      case 'history':
        return <HistoryPage onSelectTrip={(tripId) => setView({ name: 'trip-detail', tripId })} />
      case 'stats':
        return <StatsPage />
    }
  }

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
              onClick={() => {
                const fromIndex = TAB_ORDER.indexOf(activeTab)
                const toIndex = TAB_ORDER.indexOf(tab.name)
                if (fromIndex !== -1 && toIndex !== -1 && toIndex !== fromIndex) {
                  setDirection(toIndex > fromIndex ? 'forward' : 'backward')
                }
                setView({ name: tab.name } as View)
              }}
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

      {view.name === 'trip-detail' ? (
        <TripDetailPage tripId={view.tripId} onBack={() => setView({ name: 'history' })} />
      ) : (
        <TabTransition
          activeTab={activeTab}
          direction={direction}
          renderTab={renderTab}
          onSettle={() => setSettledTab(activeTab)}
        />
      )}

      {/*
        Debug tools + footer are one bottom-anchored group, not two
        independently-pinned pieces — marginTop: 'auto' on the group (not
        on the footer alone) is what makes them sit flush together at the
        true bottom of the viewport on short pages, with the actual page
        content above filling the rest of the space.
      */}
      <div style={{ marginTop: 'auto' }}>
        {/*
          Stats is a pure read-only report — there's nothing there to debug,
          unlike Shopping List/History where trip and receipt data is
          actively worked with. `settledTab` (not `activeTab`/view.name) so
          trip detail, reached via History, still counts as "in History"
          here too, and so this only flips once a transition actually
          settles (see the `settledTab` comment above).
        */}
        {settledTab !== 'stats' && <DbDebugPanel />}
        <Footer />
      </div>
    </main>
  )
}

export default App
