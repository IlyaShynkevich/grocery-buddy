import { useEffect, useRef, useState, type ComponentType, type CSSProperties, type ReactNode } from 'react'
import { AboutPage } from './features/about/AboutPage'
import { CustomizePage } from './features/customize/CustomizePage'
import { DbDebugPanel } from './features/debug/DbDebugPanel'
import { Footer } from './features/footer/Footer'
import { HistoryPage } from './features/history/HistoryPage'
import { TripDetailPage } from './features/history/TripDetailPage'
import { HomePage } from './features/home/HomePage'
import { BarChartIcon, ClockIcon, GearIcon, HomeIcon, InfoIcon, ShoppingBagIcon, type IconProps } from './features/navigation/icons'
import { TabTransition, type SlideDirection } from './features/navigation/TabTransition'
import { ReceiptCapture } from './features/receipt-capture/ReceiptCapture'
import { ReceiptReviewPanel } from './features/receipt-review/ReceiptReviewPanel'
import { ShoppingListPage } from './features/shopping-list/ShoppingListPage'
import { StatsPage } from './features/stats/StatsPage'
import { PAGE_MAX_WIDTH } from './lib/ui'

// The 4 icon-only tabs in the middle of the nav bar — these are the ones
// swipe gesture navigation moves between. Home and About (the corner icons)
// are deliberately not part of this set: they're reached only by tapping,
// same as trip-detail reached via History.
type TabName = 'shopping' | 'history' | 'stats' | 'customize'
type View =
  | { name: TabName }
  | { name: 'trip-detail'; tripId: number }
  | { name: 'home' }
  | { name: 'about' }

const TABS: Array<{ name: TabName; label: string; testId: string; Icon: ComponentType<IconProps> }> = [
  { name: 'shopping', label: 'Shopping List', testId: 'nav-shopping', Icon: ShoppingBagIcon },
  { name: 'history', label: 'History', testId: 'nav-history', Icon: ClockIcon },
  { name: 'stats', label: 'Stats', testId: 'nav-stats', Icon: BarChartIcon },
  { name: 'customize', label: 'Customize', testId: 'nav-customize', Icon: GearIcon },
]

// Single source of truth for swipe/tab order, shared with the tab bar above.
const TAB_ORDER: TabName[] = TABS.map((tab) => tab.name)

const ACTIVE_TAB_STORAGE_KEY = 'grocery-buddy:activeTab'
// sessionStorage (not localStorage): persists across a same-tab reload but
// resets once the tab/app is fully closed and reopened — exactly the signal
// needed to tell "mid-session reload" (restore the last tab) apart from a
// genuinely fresh app open (always show Home first), see readInitialView.
const HOME_SEEN_STORAGE_KEY = 'grocery-buddy:homeSeenThisSession'

/**
 * Reads the last-active tab back out of localStorage for the initial render,
 * so a reload lands back where the user was instead of always defaulting to
 * Shopping List. Read as the useState initializer (not an effect) so it's
 * already correct on the very first render — TabTransition only animates a
 * tab that differs from the previous one it saw, so an effect-based restore
 * (landing on "shopping" for one render, then jumping to the real tab) would
 * have visibly slid in instead of just being there.
 */
function readStoredTab(): TabName {
  try {
    const stored = localStorage.getItem(ACTIVE_TAB_STORAGE_KEY)
    return stored !== null && (TAB_ORDER as string[]).includes(stored) ? (stored as TabName) : 'shopping'
  } catch {
    // e.g. Safari private browsing throws on any localStorage access — this
    // is a nice-to-have, not core functionality, so just fall back silently.
    return 'shopping'
  }
}

function hasSeenHomeThisSession(): boolean {
  try {
    return sessionStorage.getItem(HOME_SEEN_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * A genuinely fresh app open (this browsing session has never navigated past
 * Home) always starts on Home, regardless of whatever tab localStorage has
 * persisted from a previous session — a mid-session reload (the flag is
 * already set) restores that persisted tab instead, same as before Home
 * existed.
 */
function readInitialView(): View {
  return hasSeenHomeThisSession() ? { name: readStoredTab() } : { name: 'home' }
}

// Minimum horizontal travel (px) before a gesture counts as an intentional
// swipe, versus being e.g. a static tap or a proceeded-but-quickly-released
// touch that shouldn't switch tabs.
const SWIPE_MIN_DISTANCE = 50
// Travel (px) before a gesture commits to being horizontal vs. vertical —
// below this, direction is still ambiguous and the gesture is left alone.
const SWIPE_DIRECTION_LOCK = 10

// Icon-only buttons, square-ish touch targets — shared by the 4 middle tabs
// and the 2 corner icons (Home/About), same active/inactive color language
// the old text-label tab bar used (solid accent fill vs. plain/transparent).
function tabButtonStyle(active: boolean): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0.5rem',
    background: active ? 'var(--accent)' : 'transparent',
    color: active ? 'var(--accent-contrast)' : 'inherit',
    borderColor: active ? 'var(--accent)' : 'transparent',
  }
}

function cornerButtonStyle(active: boolean): CSSProperties {
  return { ...tabButtonStyle(active), padding: '0.4rem' }
}

function App() {
  const [view, setView] = useState<View>(readInitialView)
  // trip-detail isn't its own tab — it's reached via History, so it keeps
  // the History tab highlighted rather than showing no active tab at all.
  // Home/About aren't part of the swipeable tab set at all, so neither the
  // middle tab bar nor swipe has an active tab while on either of them.
  const activeTab: TabName | null =
    view.name === 'trip-detail' ? 'history' : view.name === 'home' || view.name === 'about' ? null : view.name
  const mainRef = useRef<HTMLElement>(null)

  // Persist whichever of the 4 main tabs is active (trip-detail counts as
  // History, same as the nav highlight above) so the next reload restores it
  // via readStoredTab above — home/about are corner icons, not part of this,
  // so activeTab is null (and nothing written) while on either of them. The
  // same condition is also exactly "the user navigated away from Home into
  // the CTA or a nav tab" (About doesn't count, matching the spec), so this
  // is also where the homeSeen flag gets set for readInitialView above.
  useEffect(() => {
    if (activeTab === null) return
    try {
      localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, activeTab)
      sessionStorage.setItem(HOME_SEEN_STORAGE_KEY, '1')
    } catch {
      // Safari private browsing etc. — see readStoredTab's comment.
    }
  }, [activeTab])
  // Which way the last tab switch happened, for TabTransition's slide
  // direction — updated by both the swipe handler and the tab-bar taps
  // below, so either input path gets the same directional animation.
  const [direction, setDirection] = useState<SlideDirection>('forward')

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

      const currentIndex = activeTab === null ? -1 : TAB_ORDER.indexOf(activeTab)
      if (currentIndex === -1) return // e.g. trip detail, Home, About — not one of the swipeable tabs
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
      case 'customize':
        return <CustomizePage />
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
          alignItems: 'center',
          gap: '0.25rem',
          maxWidth: PAGE_MAX_WIDTH,
          margin: '0.75rem auto 0',
          padding: '0 1rem 0.75rem',
          borderBottom: '1px solid var(--border)',
        }}
      >
        {/* Home (top-left) and About (top-right) are plain tap-only corner
            icons — deliberately outside TAB_ORDER/TABS, so they never
            participate in swipe navigation, only in the onClick below. */}
        <button
          type="button"
          data-testid="nav-home"
          aria-label="Home"
          title="Home"
          onClick={() => setView({ name: 'home' })}
          style={cornerButtonStyle(view.name === 'home')}
        >
          <HomeIcon />
        </button>

        <div style={{ display: 'flex', flex: 1, justifyContent: 'center', gap: '0.25rem' }}>
          {TABS.map((tab) => {
            const active = tab.name === activeTab
            const Icon = tab.Icon
            return (
              <button
                key={tab.name}
                type="button"
                data-testid={tab.testId}
                aria-label={tab.label}
                title={tab.label}
                onClick={() => {
                  const fromIndex = activeTab === null ? -1 : TAB_ORDER.indexOf(activeTab)
                  const toIndex = TAB_ORDER.indexOf(tab.name)
                  if (fromIndex !== -1 && toIndex !== -1 && toIndex !== fromIndex) {
                    setDirection(toIndex > fromIndex ? 'forward' : 'backward')
                  }
                  setView({ name: tab.name })
                }}
                style={tabButtonStyle(active)}
              >
                <Icon />
              </button>
            )
          })}
        </div>

        <button
          type="button"
          data-testid="nav-about"
          aria-label="About"
          title="About"
          onClick={() => setView({ name: 'about' })}
          style={cornerButtonStyle(view.name === 'about')}
        >
          <InfoIcon />
        </button>
      </nav>

      {view.name === 'trip-detail' ? (
        <TripDetailPage tripId={view.tripId} onBack={() => setView({ name: 'history' })} />
      ) : view.name === 'home' ? (
        <HomePage onShop={() => setView({ name: 'shopping' })} />
      ) : view.name === 'about' ? (
        <AboutPage />
      ) : (
        <TabTransition activeTab={view.name} direction={direction} renderTab={renderTab} />
      )}

      {/*
        Debug tools + footer are static, outside TabTransition entirely —
        they never slide, jump, or animate due to a tab switch; they just
        reflow like any other static content below it. marginTop: 'auto' on
        the group (not on the footer alone) is what makes them sit flush
        together at the true bottom of the viewport on short pages, with the
        actual page content above filling the rest of the space.
      */}
      <div style={{ marginTop: 'auto' }}>
        {/*
          Debug tools only appears on Shopping List — the one tab where trip/
          receipt data is actively worked with, and the only tab where the
          resulting footer/Debug-tools content-height difference can never
          show up as a jump (there's nothing else to jump against, since it
          never appears on History or Stats to begin with). Plain, instant
          conditional on `activeTab`, same as the tab bar's own highlight.
        */}
        {activeTab === 'shopping' && <DbDebugPanel />}
        <Footer />
      </div>
    </main>
  )
}

export default App
