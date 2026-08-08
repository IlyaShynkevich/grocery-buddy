import { Mascot } from '../mascot/Mascot'
import { PAGE_MAX_WIDTH, primaryButtonStyle } from '../../lib/ui'

interface HomePageProps {
  onShop: () => void
}

// Reached only via the top-left Home icon (outside the swipeable tab set,
// same pattern as About) — or automatically on a genuinely fresh app open,
// see readInitialView in App.tsx. Duolingo-style onboarding layout: mascot
// as the visual anchor, minimal text, one clear CTA, all centered in the
// space between the nav bar and the footer.
export function HomePage({ onShop }: HomePageProps) {
  return (
    <section
      data-testid="home-page"
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1.25rem',
        width: '100%',
        maxWidth: PAGE_MAX_WIDTH,
        margin: '0 auto',
        padding: '2rem 1rem',
        textAlign: 'center',
      }}
    >
      <h1 style={{ fontSize: '1.75rem' }}>Grocery Buddy</h1>
      {/* Negative margin pulls the mascot right up under the title, reading
          as "standing just below it" rather than floating with its own gap. */}
      <div style={{ marginTop: '-0.5rem' }}>
        <Mascot pose="thumbsup" size={150} />
      </div>
      <button
        type="button"
        data-testid="home-shop-button"
        onClick={onShop}
        style={{ ...primaryButtonStyle, padding: '0.75rem 1.75rem', fontSize: '1rem' }}
      >
        I'm ready to shop
      </button>
    </section>
  )
}
