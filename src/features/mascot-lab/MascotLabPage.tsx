import { useEffect, useState } from 'react'
import { Mascot } from '../mascot/Mascot'
import {
  captionStyle,
  cardStyle,
  footnoteStyle,
  headingStyle,
  mutedTextStyle,
  PAGE_MAX_WIDTH,
  primaryButtonStyle,
  space,
  subtleTextStyle,
  titleStyle,
} from '../../lib/ui'
import { MASCOT_OPTIONS, type MascotOption } from './mascotLab'
import './mascotLab.css'

/** TEMPORARY — see mascotLab.ts. Rendered only with ?mascot=1. */

/** The size the mascot is actually rendered at on Home, so this compares like for like. */
const HOME_MASCOT_SIZE = 150
const GRID_MASCOT_SIZE = 96

/**
 * One animated mascot. `key` is bumped by the page's Restart button so
 * every tile's animation begins from 0 at the same moment — otherwise the
 * options drift out of phase and side-by-side comparison is meaningless.
 */
function AnimatedMascot({ option, size, speed }: { option: MascotOption; size: number; speed: number }) {
  // animationDuration is set per element rather than by scaling a CSS
  // variable, because the two Wander layers must stay locked to the same
  // duration as each other for the gait to line up with the path.
  const duration = `${option.durationMs / speed}ms`
  const inner = (
    <div className={option.innerClass ? `gb-lab-anim ${option.innerClass}` : undefined} style={option.innerClass ? { animationDuration: duration } : undefined}>
      <Mascot pose="thumbsup" size={size} />
    </div>
  )
  if (!option.outerClass) return inner
  return (
    <div className={`gb-lab-anim ${option.outerClass}`} style={{ animationDuration: duration }}>
      {inner}
    </div>
  )
}

export function MascotLabPage() {
  const [speed, setSpeed] = useState(1)
  const [restartKey, setRestartKey] = useState(0)
  const [focused, setFocused] = useState<string | null>(null)
  const [reducedMotion, setReducedMotion] = useState(false)

  // Reported rather than worked around: the options honour
  // prefers-reduced-motion (as the real one will have to), so on a device
  // with it on this page is legitimately static. Saying so keeps that from
  // looking like the demo is broken.
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  const focusedOption = MASCOT_OPTIONS.find((option) => option.id === focused) ?? null

  return (
    <main
      data-testid="mascot-lab"
      style={{ width: '100%', maxWidth: PAGE_MAX_WIDTH, margin: '0 auto', padding: space.xl, textAlign: 'left' }}
    >
      <h1 style={titleStyle}>Mascot idle</h1>
      <p style={{ ...footnoteStyle, ...mutedTextStyle, marginTop: space.xs }}>
        Temporary comparison page (<code>?mascot=1</code>). Not part of the app. CSS transforms on the existing PNG only.
      </p>

      {reducedMotion && (
        <p
          role="status"
          data-testid="mascot-lab-reduced-motion"
          style={{ ...cardStyle, ...footnoteStyle, marginTop: space.lg, boxShadow: '0 0 0 1px var(--border-strong)' }}
        >
          This device has <strong>Reduce motion</strong> turned on, so every option below is correctly showing as
          still. Turn it off in the OS to compare them.
        </p>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: space.md, marginTop: space.lg, flexWrap: 'wrap' }}>
        <button type="button" data-testid="mascot-lab-restart" onClick={() => setRestartKey((n) => n + 1)} style={primaryButtonStyle}>
          Restart all in sync
        </button>
        {[0.25, 0.5, 1].map((option) => (
          <button
            key={option}
            type="button"
            data-testid={`mascot-lab-speed-${option}`}
            onClick={() => setSpeed(option)}
            aria-pressed={speed === option}
            style={speed === option ? primaryButtonStyle : undefined}
          >
            {`${option}×`}
          </button>
        ))}
      </div>
      <p style={{ ...captionStyle, ...subtleTextStyle, marginTop: space.md }}>
        1× is real speed. The slower settings are for inspecting the subtle ones — judge them at 1×.
      </p>

      {/* Focused view: the picked option at the size Home actually uses,
          which is the only size the decision should be made at. */}
      {focusedOption && (
        <section
          data-testid="mascot-lab-focus"
          style={{ ...cardStyle, marginTop: space.lg, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: space.md }}
        >
          <h2 style={headingStyle}>{focusedOption.name} — at Home’s size</h2>
          {/* Fixed height so a moving option can't resize the card under
              it, and full width so Wander has somewhere to travel — with
              the box shrunk to the mascot, overflow:hidden clipped the
              whole journey and it read as standing still. */}
          <div
            data-testid="mascot-lab-focus-stage"
            style={{ height: HOME_MASCOT_SIZE * 1.25, width: '100%', maxWidth: HOME_MASCOT_SIZE * 1.9, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', overflow: 'hidden' }}
          >
            <AnimatedMascot key={`focus-${focusedOption.id}-${restartKey}-${speed}`} option={focusedOption} size={HOME_MASCOT_SIZE} speed={speed} />
          </div>
          <p style={{ ...footnoteStyle, ...mutedTextStyle, textAlign: 'center' }}>{focusedOption.note}</p>
          <button type="button" onClick={() => setFocused(null)}>
            Close
          </button>
        </section>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: space.lg, marginTop: space.lg }}>
        {MASCOT_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            data-testid="mascot-lab-option"
            data-option={option.id}
            // Read by e2e/_mascot-frames.spec.ts so the option list stays
            // defined in exactly one place.
            data-detail-window={option.detailWindow?.join(',')}
            onClick={() => setFocused(option.id)}
            style={{ ...cardStyle, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: space.md, textAlign: 'center', border: 'none' }}
          >
            {/* Fixed box: Wander travels sideways and the hop leaves the
                ground, and neither may reflow the grid while it plays. */}
            <div
              data-testid="mascot-lab-stage"
              style={{ height: GRID_MASCOT_SIZE * 1.3, width: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', overflow: 'hidden' }}
            >
              <AnimatedMascot key={`${option.id}-${restartKey}-${speed}`} option={option} size={GRID_MASCOT_SIZE} speed={speed} />
            </div>
            <span style={headingStyle}>{option.name}</span>
            <span style={{ ...captionStyle, ...mutedTextStyle }}>{option.summary}</span>
          </button>
        ))}
      </div>

      <p style={{ ...captionStyle, ...subtleTextStyle, marginTop: space.xl }}>
        Tap any option to see it at Home’s real size. Every option honours <code>prefers-reduced-motion</code>.
      </p>
    </main>
  )
}
