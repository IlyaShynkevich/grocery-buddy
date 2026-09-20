import { useRef } from 'react'
import { toggleDebugTools } from '../debug/debugTools'
import { Mascot } from '../mascot/Mascot'
import { showToast } from '../toast/toastStore'
import { useT } from '../../i18n'
import { displayStyle, PAGE_MAX_WIDTH, primaryButtonStyle, space } from '../../lib/ui'

/** Max gap between taps of the Debug tools gesture (3 taps on the mascot). */
const SECRET_TAP_GAP_MS = 1500
const SECRET_TAP_COUNT = 3

interface HomePageProps {
  onShop: () => void
}

// Reached only via the top-left Home icon (outside the swipeable tab set,
// same pattern as About) — or automatically on a genuinely fresh app open,
// see readInitialView in App.tsx. Duolingo-style onboarding layout: mascot
// as the visual anchor, minimal text, one clear CTA, all centered in the
// space between the nav bar and the footer.
export function HomePage({ onShop }: HomePageProps) {
  const messages = useT()
  const taps = useRef({ count: 0, last: 0 })

  // Secret gesture: three taps on the mascot, each within SECRET_TAP_GAP_MS
  // of the last, toggle Debug tools (see debugTools.ts). Deliberately gives
  // no hint it exists — no button role, cursor or tap feedback — only the
  // toast once it has actually toggled.
  const handleMascotTap = () => {
    const now = Date.now()
    const tap = taps.current
    tap.count = now - tap.last <= SECRET_TAP_GAP_MS ? tap.count + 1 : 1
    tap.last = now
    if (tap.count < SECRET_TAP_COUNT) return
    tap.count = 0

    let nowEnabled: boolean
    try {
      nowEnabled = toggleDebugTools()
    } catch (err) {
      // The toggle itself applied; only remembering it for the session failed.
      console.error('Grocery Buddy: could not remember the Debug tools setting', err)
      showToast(messages.debugTools.notRemembered(err instanceof Error ? err.message : String(err)))
      return
    }
    showToast(nowEnabled ? messages.debugTools.enabled : messages.debugTools.hidden)
  }
  return (
    <section
      data-testid="home-page"
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space['2xl'],
        width: '100%',
        maxWidth: PAGE_MAX_WIDTH,
        margin: '0 auto',
        padding: `${space['3xl']} ${space.xl}`,
        textAlign: 'center',
      }}
    >
      <h1 style={displayStyle}>Grocery Buddy</h1>
      {/* Negative margin pulls the mascot right up under the title, reading
          as "standing just below it" rather than floating with its own gap. */}
      <div data-testid="home-mascot" onClick={handleMascotTap} style={{ marginTop: `-${space.md}`, touchAction: 'manipulation' }}>
        <Mascot pose="thumbsup" size={150} />
      </div>
      <button
        type="button"
        data-testid="home-shop-button"
        onClick={onShop}
        style={{ ...primaryButtonStyle, padding: `${space.lg} ${space['3xl']}`, borderRadius: 999 }}
      >
        {messages.home.cta}
      </button>
    </section>
  )
}
