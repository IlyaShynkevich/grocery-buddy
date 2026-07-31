import { useEffect, useRef, useState, type ReactNode } from 'react'

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

export type SlideDirection = 'forward' | 'backward'

interface TabTransitionProps<T extends string> {
  activeTab: T
  direction: SlideDirection
  renderTab: (tab: T) => ReactNode
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
 * transition is in flight (see the synchronous state update above), so
 * these two keys never collide.
 *
 * The wrapper is `display: grid` with both panels placed in the same cell
 * (`gridArea: '1 / 1'`), not `position: relative` + `position: absolute` on
 * the outgoing panel. That distinction matters for height: an absolutely
 * positioned element contributes nothing to its container's height, so with
 * the old approach the wrapper's height snapped *instantly*, in the same
 * commit that starts a transition, to just the incoming page's natural
 * height — independent of and well before the slide animation had visibly
 * progressed at all. If the two pages have different heights (e.g. a
 * populated Shopping List vs. an empty History), everything below (Debug
 * tools, the footer) jumped position in that same instant — a second,
 * separate flick from the remount one above, measured directly via a
 * frame-by-frame trace (a ~159px jump between two consecutive animation
 * frames). With both panels as normal (non-absolute) grid items sharing one
 * cell, the grid's auto-sized row height is the *max* of everything placed
 * in it, so the wrapper reflects the taller of the two pages for as long as
 * both are present, and only settles to the incoming page's height once the
 * outgoing panel actually unmounts at the end of the transition — after the
 * slide has already visually finished, a far less jarring moment for a
 * layout shift. Since neither panel is positioned anymore, default paint
 * order would otherwise flip to DOM order (the later-rendered incoming
 * panel on top); the outgoing panel's explicit `zIndex: 1` keeps it
 * painting above the incoming one, preserving the intended "outgoing slides
 * away revealing incoming underneath" visual from the opaque-panels fix.
 */
export function TabTransition<T extends string>({ activeTab, direction, renderTab }: TabTransitionProps<T>) {
  const [outgoing, setOutgoing] = useState<{ tab: T; direction: SlideDirection } | null>(null)
  const previousTab = useRef(activeTab)

  // Deliberately done during render, not in a useEffect: an effect only
  // runs after commit, so there'd be one render in between where `activeTab`
  // already reflects the new tab but `outgoing` still holds the *previous*
  // switch's value — which, on a quick back-and-forth (A -> B -> A), is
  // momentarily the same tab as the new `activeTab` itself, rendering two
  // copies of the same page. Updating synchronously here closes that gap.
  if (previousTab.current !== activeTab) {
    setOutgoing({ tab: previousTab.current, direction })
    previousTab.current = activeTab
  }

  useEffect(() => {
    if (!outgoing) return
    const timeout = setTimeout(() => setOutgoing(null), TRANSITION_MS)
    return () => clearTimeout(timeout)
  }, [outgoing])

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
    // share one cell and size the wrapper to the taller of the two — see
    // the doc comment above.
    <div style={{ display: 'grid', overflow: outgoing ? 'hidden' : 'visible' }}>
      {outgoing && (
        <div
          key={outgoing.tab}
          className="gb-tab-slide"
          // pointer-events: none — this copy is on its way out, it shouldn't
          // still be tappable during the brief window it's animating away.
          style={{
            gridArea: '1 / 1',
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
                background: 'var(--bg)',
                animation: `${incomingAnimation} ${TRANSITION_MS}ms ${EASE_INCOMING} both`,
              }
            : { gridArea: '1 / 1' }
        }
      >
        {renderTab(activeTab)}
      </div>
    </div>
  )
}
