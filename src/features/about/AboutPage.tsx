import packageJson from '../../../package.json'
import { PAGE_MAX_WIDTH, mutedTextStyle } from '../../lib/ui'

// Reached only via the top-right About icon (outside the swipeable tab set,
// same pattern as Home) — same centered, minimal layout language as
// HomePage, just without a CTA: there's nowhere further for this page to
// send you.
export function AboutPage() {
  return (
    <section
      data-testid="about-page"
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
      <div>
        <h1 style={{ fontSize: '1.75rem' }}>Grocery Buddy</h1>
        <p data-testid="about-version" style={{ ...mutedTextStyle, fontSize: '0.8rem', marginTop: '0.2rem' }}>
          v{packageJson.version}
        </p>
      </div>

      {/* Left-aligned within the otherwise-centered page — bullet text reads
          poorly center-aligned, each line's indent shifting around. */}
      <ul
        data-testid="about-description"
        style={{
          textAlign: 'left',
          fontSize: '0.9rem',
          lineHeight: 1.5,
          margin: 0,
          paddingLeft: '1.1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.4rem',
        }}
      >
        <li>Build your shopping list before or during a trip.</li>
        <li>Scan a receipt (camera or gallery) — AI pulls out items, prices, and categories.</li>
        <li>Review and confirm each scan before it's saved.</li>
        <li>Browse your trip history, grouped by month.</li>
        <li>See monthly stats: essential vs. non-essential spend, and spend by category.</li>
      </ul>

      <p style={{ fontSize: '0.85rem' }}>Ilya Shynkevich</p>

      <p data-testid="about-planned" style={{ ...mutedTextStyle, fontSize: '0.75rem' }}>
        Planned: trends over time / month-to-month spending comparisons.
      </p>
    </section>
  )
}
