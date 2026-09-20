import packageJson from '../../../package.json'
import { useT } from '../../i18n'
import { captionStyle, PAGE_MAX_WIDTH, space, subtleTextStyle } from '../../lib/ui'

// Placeholder mascot — same shopping-bag glyph already used for the
// favicon/app icons (see public/favicon.svg). Swap this one path for real
// mascot artwork later; nothing else here needs to change.
const MASCOT_ICON_SRC = '/favicon.svg'

export function Footer() {
  const messages = useT()
  return (
    <footer
      data-testid="app-footer"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: space.lg,
        // Matches every other page section's capped width (see pageStyle) —
        // an earlier deliberate full-bleed treatment was reverted since it
        // read as inconsistent with the rest of the app's content width.
        width: '100%',
        maxWidth: PAGE_MAX_WIDTH,
        margin: '0 auto',
        padding: `${space.lg} ${space.xl}`,
        borderTop: '1px solid var(--separator)',
      }}
    >
      <img
        src={MASCOT_ICON_SRC}
        alt={messages.footer.mascotAlt}
        width={32}
        height={32}
        style={{ borderRadius: 'var(--radius-sm)' }}
      />
      <div style={{ ...captionStyle, ...subtleTextStyle, textAlign: 'right' }}>
        <div>Ilya Shynkevich</div>
        <div data-testid="app-footer-version">v{packageJson.version}</div>
      </div>
    </footer>
  )
}
