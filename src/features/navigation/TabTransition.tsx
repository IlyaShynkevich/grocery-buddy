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
 * outgoing one unmounts as soon as its animation ends.
 *
 * Wraps only the active page's own content — callers keep the tab bar,
 * Debug tools, and the footer entirely outside this component so none of
 * them are affected by (or need to account for) the slide.
 *
 * The current tab's wrapper `<div>` (key `activeTab`) is rendered in the
 * exact same position/shape whether or not a transition is in flight — only
 * the outgoing sibling is conditionally added/removed, and the current
 * div's own animation is just a style tweak. An earlier version swapped
 * between "no wrapper" and "wrapper + sibling" shapes depending on
 * transition state, which made React remount the *current* tab's whole
 * subtree the instant an animation finished — losing DOM node identity
 * mid-interaction.
 *
 * Both wrapper divs are keyed by the bare tab name (`outgoing.tab` /
 * `activeTab`), not a role-prefixed string like `outgoing-${tab}` — a tab's
 * wrapper must keep the *same* key across the render where it switches from
 * playing the "current" role to playing the "outgoing" role, or React reads
 * the key change as "different element" and remounts that tab's whole
 * subtree (losing its live-query data, resetting local state) right as the
 * transition starts, before the slide animation's first paint.
 *
 * The wrapper is `display: grid` with both panels placed in the same cell
 * (`gridArea: '1 / 1'`, `alignSelf: 'start'` so each panel's height is
 * always its own natural content height, never stretched to match the
 * other's). The grid sizes to the max of both panels' heights while both are
 * mounted, settling to just the current panel's height once the outgoing one
 * unmounts — a deliberate simplification, not something this component tries
 * to smooth over. The footer (the only thing below this component now — see
 * CLAUDE.md, Debug tools was moved to only render on the Shopping List tab)
 * is a sibling outside this component entirely, so it just reflows with the
 * page like any other static content.
 *
 * Since neither panel is `position`-based, default paint order would
 * otherwise be DOM order (the later-rendered incoming panel on top); the
 * outgoing panel's explicit `zIndex: 1` keeps it painting above the incoming
 * one. Both panels get an opaque `background` — the asymmetric easing curves
 * mean they briefly overlap geometrically mid-slide, and without an opaque
 * background both pages' text would bleed together during that overlap.
 */
export function TabTransition<T extends string>({ activeTab, direction, renderTab }: TabTransitionProps<T>) {
  const [outgoing, setOutgoing] = useState<{ tab: T; direction: SlideDirection } | null>(null)

  // Deliberately done during render, not in a useEffect: an effect only
  // runs after commit, so there'd be one render in between where `activeTab`
  // already reflects the new tab but `outgoing` still holds the *previous*
  // switch's value — which, on a quick back-and-forth (A -> B -> A), is
  // momentarily the same tab as the new `activeTab` itself, rendering two
  // copies of the same page. Updating synchronously here closes that gap.
  const previousTab = useRef(activeTab)
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
    <div style={{ display: 'grid', overflow: outgoing ? 'hidden' : 'visible' }}>
      {outgoing && (
        <div
          key={outgoing.tab}
          className="gb-tab-slide"
          // pointer-events: none — this copy is on its way out, it shouldn't
          // still be tappable during the brief window it's animating away.
          style={{
            gridArea: '1 / 1',
            alignSelf: 'start',
            zIndex: 1,
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
