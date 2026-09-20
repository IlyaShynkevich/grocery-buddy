import { calloutStyle, space } from '../../lib/ui'
import { TOAST_DURATION_MS, useToast } from './toastStore'

/** The single app-wide toast slot (see showToast). Rendered once, at the App root. */
export function Toast() {
  const toast = useToast()
  if (!toast) return null

  return (
    <div
      key={toast.id}
      role="status"
      aria-live="polite"
      data-testid="toast"
      className="gb-toast"
      style={{
        // Pinned to both sides + fit-content + auto margins, rather than
        // left: 50% + translateX(-50%): that caps a shrink-to-fit box at half
        // the viewport, wrapping even short messages onto two lines.
        ...calloutStyle,
        position: 'fixed',
        left: space.xl,
        right: space.xl,
        bottom: space['2xl'],
        width: 'fit-content',
        margin: '0 auto',
        zIndex: 900,
        textAlign: 'center',
        padding: `${space.md} ${space.xl}`,
        borderRadius: 999,
        background: 'var(--accent)',
        color: 'var(--accent-contrast)',
        fontWeight: 500,
        boxShadow: '0 4px 14px rgba(0, 0, 0, 0.18)',
        pointerEvents: 'none',
        animationDuration: `${TOAST_DURATION_MS}ms`,
      }}
    >
      {toast.text}
    </div>
  )
}
