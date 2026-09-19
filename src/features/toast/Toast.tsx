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
        position: 'fixed',
        left: '1rem',
        right: '1rem',
        bottom: '1.25rem',
        width: 'fit-content',
        margin: '0 auto',
        zIndex: 900,
        textAlign: 'center',
        padding: '0.55rem 1rem',
        borderRadius: 'var(--radius)',
        background: 'var(--accent)',
        color: 'var(--accent-contrast)',
        fontSize: '0.9rem',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
        pointerEvents: 'none',
        animationDuration: `${TOAST_DURATION_MS}ms`,
      }}
    >
      {toast.text}
    </div>
  )
}
