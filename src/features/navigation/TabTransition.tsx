import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

// Long enough to read as a smooth slide rather than a flash-cut, short
// enough to not feel laggy when swiping quickly between tabs.
const TRANSITION_MS = 300

// Asymmetric easing, not the same curve both ways: a decelerate curve for
// the incoming tab (settles into place) and an accelerate curve for the
// outgoing one (speeds away rather than lingering/decelerating on its way
// off-screen, which read as hesitation). Standard Material Design motion
// curves.
const EASE_INCOMING = 'cubic-bezier(0, 0, 0.2, 1)'
const EASE_OUTGOING = 'cubic-bezier(0.4, 0, 1, 1)'
// The wrapper's height animation (see the doc comment below) isn't tied to
// either panel's own entrance/exit, just a smooth interpolation between two
// heights — a plain ease-in-out, not one of the asymmetric curves above.
const EASE_HEIGHT = 'ease-in-out'

export type SlideDirection = 'forward' | 'backward'

interface TabTransitionProps<T extends string> {
  activeTab: T
  direction: SlideDirection
  renderTab: (tab: T) => ReactNode
  /** Called once a transition has fully finished (the outgoing panel has unmounted) — not the instant one starts. */
  onSettle?: () => void
}

/**
 * Slides the outgoing tab out and the incoming tab in — direction matching
 * how the switch happened (swipe direction, or index order for a tab-bar
 * tap) — instead of the instant hard-cut a plain conditional render would
 * give. Only the two tabs involved in a switch are ever mounted at once; the
 * outgoing one unmounts as soon as its animation ends so it doesn't linger
 * around holding onto live-query subscriptions or being (invisibly) tappable.
 *
 * The current tab's wrapper `<div>` (key `activeTab`) is rendered in the
 * exact same position/shape whether or not a transition is in flight — only
 * the outgoing sibling is conditionally added/removed, and the current
 * div's own animation is just a style tweak. This matters: an earlier
 * version swapped between "no wrapper" and "wrapper + sibling" shapes
 * depending on transition state, which made React tear down and remount the
 * *current* tab's whole subtree the instant an animation finished — losing
 * DOM node identity mid-interaction (e.g. a click landing right as the
 * transition ended would hit an element that had just been detached).
 *
 * Both wrapper divs are keyed by the bare tab name (`outgoing.tab` /
 * `activeTab`), not a role-prefixed string like `outgoing-${tab}` — a tab's
 * wrapper must keep the *same* key across the render where it switches from
 * playing the "current" role to playing the "outgoing" role, or React reads
 * the key change as "different element" and remounts that tab's whole
 * subtree (losing its live-query data, resetting local state) right as the
 * transition starts, before the slide animation's first paint — a visible
 * flick/snap of already-loaded content briefly reverting to a loading
 * state. `outgoing.tab` and `activeTab` are always different tabs while a
 * transition is in flight (see the synchronous state update below), so
 * these two keys never collide.
 *
 * The wrapper is `display: grid` with both panels placed in the same cell
 * (`gridArea: '1 / 1'`, `alignSelf: 'start'` so each panel's height is
 * always its own natural content height, never stretched to match the
 * other's), not `position: relative` + `position: absolute` on the
 * outgoing panel. Height is then animated explicitly (see below) rather
 * than left to the grid's own auto-sizing, which — sizing to the *max* of
 * both panels while both are mounted — only defers a height snap to the
 * moment the outgoing panel unmounts, rather than eliminating it. That
 * deferred snap turned out to still be clearly visible for page pairs with
 * a large height difference (e.g. Stats, by far the app's tallest page,
 * transitioning to History): confirmed via a frame-by-frame trace that
 * Stats -> History showed a real, ~285px jump a full 300ms *after* the
 * slide had already finished, while History -> Stats (Stats as the
 * *incoming*, not outgoing, panel) showed no such deferred jump — the
 * wrapper was already sized to Stats' height from the transition's first
 * frame, nothing left to defer. So instead: capture the wrapper's current
 * height (`fromHeight`, read synchronously in the state update below,
 * before the transition's first commit) and the incoming panel's natural
 * height, then explicitly animate the wrapper's `height` between them with
 * a CSS transition timed to `TRANSITION_MS` — the wrapper's `overflow:
 * hidden` (already present for the horizontal slide) clips whichever panel
 * is taller as the height interpolates, so it reads as one continuous
 * motion rather than a snap at either end. The incoming panel's height is
 * tracked with a `ResizeObserver`, not measured once — most pages read
 * their data via Dexie's `useLiveQuery`, which returns an empty/default
 * value synchronously on first mount and only renders the real (often
 * taller) content once the async query resolves a beat later, so measuring
 * only once at the start of the transition can capture the wrong (too
 * short) target height; re-targeting on resize keeps a late-resolving
 * query animating smoothly to the right place instead of leaving the
 * wrapper pinned to a stale placeholder height until the transition's
 * timer clears the override and the real size snaps in. The explicit
 * height is cleared back to `''` once the transition settles, so the
 * wrapper returns to natural grid auto-sizing for whatever content that
 * tab has later (e.g. History gaining trips).
 *
 * Since neither panel is `position`-based, default paint order would
 * otherwise be DOM order (the later-rendered incoming panel on top); the
 * outgoing panel's explicit `zIndex: 1` keeps it painting above the
 * incoming one, preserving the intended "outgoing slides away revealing
 * incoming underneath" visual from the opaque-panels fix.
 */
export function TabTransition<T extends string>({ activeTab, direction, renderTab, onSettle }: TabTransitionProps<T>) {
  const [outgoing, setOutgoing] = useState<{ tab: T; direction: SlideDirection; fromHeight: number | null } | null>(
    null,
  )
  const previousTab = useRef(activeTab)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const currentPanelRef = useRef<HTMLDivElement>(null)

  // Deliberately done during render, not in a useEffect: an effect only
  // runs after commit, so there'd be one render in between where `activeTab`
  // already reflects the new tab but `outgoing` still holds the *previous*
  // switch's value — which, on a quick back-and-forth (A -> B -> A), is
  // momentarily the same tab as the new `activeTab` itself, rendering two
  // copies of the same page. Updating synchronously here closes that gap.
  // Reading `wrapperRef.current`'s height here, before this render commits,
  // captures the wrapper's height exactly as it is right now — the
  // outgoing page's height if no transition was already in flight, or
  // wherever a still-in-flight height animation currently is if the user
  // swiped again before the previous transition settled (so a rapid second
  // switch continues smoothly from the current position, not a stale one).
  if (previousTab.current !== activeTab) {
    setOutgoing({ tab: previousTab.current, direction, fromHeight: wrapperRef.current?.getBoundingClientRect().height ?? null })
    previousTab.current = activeTab
  }

  // Drives the height animation: once the outgoing panel has actually
  // committed (both panels now present), measure the incoming panel's
  // natural height and animate the wrapper from `fromHeight` to it.
  // useLayoutEffect (not useEffect) so this runs before the browser paints
  // — the user should never see the grid's own natural (unanimated) size
  // for even one frame.
  useLayoutEffect(() => {
    const wrapper = wrapperRef.current
    const panel = currentPanelRef.current
    if (!outgoing || !wrapper || !panel || outgoing.fromHeight === null) return

    // Cleanly restarts the animation from wherever the wrapper's height
    // currently is (its live interpolated value if one's already in
    // flight) to a new target — used both for the initial animation and
    // every re-target below, rather than just changing the destination of
    // an already-active transition (redirecting an in-flight transition is
    // spec-legal, but two redirects landing close together was observed to
    // overshoot past the final target before settling, likely an artifact
    // of restarting the ease-in-out curve's velocity mid-flight; a clean
    // snap-to-current-then-transition-to-new-target avoids that).
    const animateTo = (toPx: number) => {
      const fromPx = wrapper.getBoundingClientRect().height
      wrapper.style.transition = 'none'
      wrapper.style.height = `${fromPx}px`
      wrapper.offsetHeight // force a reflow so the browser registers the line above before the next one
      wrapper.style.transition = `height ${TRANSITION_MS}ms ${EASE_HEIGHT}`
      wrapper.style.height = `${toPx}px`
    }

    // Establish the starting point with no transition, and force a reflow
    // so it's genuinely committed before `retarget` below reads it back as
    // `animateTo`'s `fromPx` — otherwise that read could catch a stale,
    // still-transitioning value left over from a previous switch.
    wrapper.style.transition = 'none'
    wrapper.style.height = `${outgoing.fromHeight}px`
    wrapper.offsetHeight
    const retarget = () => animateTo(panel.getBoundingClientRect().height)
    retarget()

    // The incoming tab's own content can still be loading at this point —
    // most pages read via Dexie's useLiveQuery, which returns an empty/
    // default value synchronously on first mount and only renders the real
    // (often taller) content once the async query resolves a beat later.
    // Measuring `toHeight` just once here, before that resolves, was
    // confirmed live to capture the wrong (too-short) target — e.g. Stats
    // mounts at ~102px (0 category bars) and only becomes ~590px (real
    // data) ~20-40ms after mount. A ResizeObserver keeps re-targeting the
    // still-in-flight height transition whenever the incoming panel's
    // natural height actually changes, so a late-resolving query still
    // animates smoothly to the right place instead of leaving the wrapper
    // pinned to a stale placeholder height until the transition's timer
    // clears the override and the real size snaps in.
    const observer = new ResizeObserver(retarget)
    observer.observe(panel)
    return () => observer.disconnect()
  }, [outgoing])

  useEffect(() => {
    if (!outgoing) return
    const timeout = setTimeout(() => {
      setOutgoing(null)
      onSettle?.()
      // Hand height back to the grid's natural auto-sizing now that only
      // one panel remains, instead of leaving it pinned to the stale pixel
      // value the animation ended at.
      const wrapper = wrapperRef.current
      if (wrapper) {
        wrapper.style.transition = ''
        wrapper.style.height = ''
      }
    }, TRANSITION_MS)
    return () => clearTimeout(timeout)
  }, [outgoing, onSettle])

  const incomingAnimation = outgoing
    ? outgoing.direction === 'forward'
      ? 'gb-slide-in-from-right'
      : 'gb-slide-in-from-left'
    : null
  const outgoingAnimation = outgoing?.direction === 'forward' ? 'gb-slide-out-to-left' : 'gb-slide-out-to-right'

  return (
    // overflow only needs to clip while a slide is actually in flight —
    // left `visible` at rest so things like the receipt source-picker menu
    // (which pops open below its button) aren't clipped by this wrapper.
    // display: grid (not position: relative) is what lets both panels below
    // share one cell — see the doc comment above.
    <div ref={wrapperRef} style={{ display: 'grid', overflow: outgoing ? 'hidden' : 'visible' }}>
      {outgoing && (
        <div
          key={outgoing.tab}
          className="gb-tab-slide"
          // pointer-events: none — this copy is on its way out, it shouldn't
          // still be tappable during the brief window it's animating away.
          style={{
            gridArea: '1 / 1',
            // Own natural height always, never stretched to match the
            // other panel — see the doc comment above.
            alignSelf: 'start',
            // Explicit stacking, not relying on default paint order: with
            // both panels as plain (non-positioned) grid items, DOM order
            // would otherwise put the later-rendered incoming panel on top.
            zIndex: 1,
            // Opaque, not transparent: the incoming/outgoing panels use
            // different (asymmetric) easing curves, so they don't stay a
            // constant panel-width apart mid-animation — they briefly
            // overlap geometrically. An opaque background here (this panel
            // paints above the incoming one via the explicit zIndex above)
            // keeps that overlap from showing as both pages' text bleeding
            // together; it just fully covers whatever is behind it until it
            // slides out of the way.
            background: 'var(--bg)',
            pointerEvents: 'none',
            animation: `${outgoingAnimation} ${TRANSITION_MS}ms ${EASE_OUTGOING} both`,
          }}
        >
          {renderTab(outgoing.tab)}
        </div>
      )}
      <div
        ref={currentPanelRef}
        key={activeTab}
        className={incomingAnimation ? 'gb-tab-slide' : undefined}
        // Opaque for the same reason as the outgoing panel above — this one
        // isn't the layer doing the occluding (outgoing paints on top via
        // its explicit zIndex), but giving it its own matching background
        // too means that doesn't depend on which panel happens to stack
        // above the other.
        style={
          incomingAnimation
            ? {
                gridArea: '1 / 1',
                alignSelf: 'start',
                background: 'var(--bg)',
                animation: `${incomingAnimation} ${TRANSITION_MS}ms ${EASE_INCOMING} both`,
              }
            : { gridArea: '1 / 1', alignSelf: 'start' }
        }
      >
        {renderTab(activeTab)}
      </div>
    </div>
  )
}
