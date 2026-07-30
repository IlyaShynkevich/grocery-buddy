import packageJson from '../../../package.json'
import { mutedTextStyle } from '../../lib/ui'

// Placeholder mascot — same shopping-bag glyph already used for the
// favicon/app icons (see public/favicon.svg). Swap this one path for real
// mascot artwork later; nothing else here needs to change.
const MASCOT_ICON_SRC = '/favicon.svg'

export function Footer() {
  return (
    <footer
      data-testid="app-footer"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '0.75rem',
        // Deliberately full-width, unlike the page content above (which
        // caps at PAGE_MAX_WIDTH and centers) — a footer bar reads as part
        // of the page chrome, not another content column, so it spans edge
        // to edge like a typical site footer.
        width: '100%',
        // marginTop: 'auto' is what pins this to the bottom of the page's
        // column-flex layout (see App.tsx) — it consumes any leftover
        // vertical space instead of the footer just following the content.
        marginTop: 'auto',
        padding: '0.75rem 1rem',
        borderTop: '1px solid var(--border)',
      }}
    >
      <img
        src={MASCOT_ICON_SRC}
        alt="Grocery Buddy mascot"
        width={32}
        height={32}
        style={{ borderRadius: 'var(--radius-sm)' }}
      />
      <div style={{ ...mutedTextStyle, textAlign: 'right', fontSize: '0.75rem', lineHeight: 1.4 }}>
        <div>Ilya Shynkevich</div>
        <div data-testid="app-footer-version">v{packageJson.version}</div>
      </div>
    </footer>
  )
}
