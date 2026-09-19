import packageJson from '../../../package.json'
import { useT } from '../../i18n'
import { PAGE_MAX_WIDTH, mutedTextStyle } from '../../lib/ui'
import { Mascot } from '../mascot/Mascot'

// Reached only via the top-right About icon (outside the swipeable tab set,
// same pattern as Home) — same centered, minimal layout language as
// HomePage, just without a CTA: there's nowhere further for this page to
// send you.
export function AboutPage() {
  const messages = useT()
  return (
    <section
      data-testid="about-page"
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        // Tuned (with the mascot size and list line-height below) so the whole
        // page fits a 393x777 phone viewport in both English and Russian.
        gap: '0.85rem',
        width: '100%',
        maxWidth: PAGE_MAX_WIDTH,
        margin: '0 auto',
        padding: '1rem 1rem',
        textAlign: 'center',
      }}
    >
      <div>
        <h1 style={{ fontSize: '1.75rem' }}>Grocery Buddy</h1>
        <p data-testid="about-version" style={{ ...mutedTextStyle, fontSize: '0.8rem', marginTop: '0.2rem' }}>
          v{packageJson.version}
        </p>
      </div>

      {/* Same negative-margin-under-the-title treatment as HomePage's
          mascot, for a consistent "standing just below it" read. */}
      <div style={{ marginTop: '-0.5rem' }}>
        <Mascot pose="thankyou" size={96} />
      </div>

      {/* Left-aligned within the otherwise-centered page — bullet text reads
          poorly center-aligned, each line's indent shifting around. */}
      <ul
        data-testid="about-description"
        style={{
          textAlign: 'left',
          fontSize: '0.9rem',
          lineHeight: 1.4,
          margin: 0,
          paddingLeft: '1.1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.4rem',
        }}
      >
        {messages.about.features.map((feature) => (
          <li key={feature}>{feature}</li>
        ))}
      </ul>

      <p style={{ fontSize: '0.85rem' }}>Ilya Shynkevich</p>

      <p data-testid="about-access" style={{ ...mutedTextStyle, fontSize: '0.75rem' }}>
        {messages.about.access}
      </p>

      <p data-testid="about-planned" style={{ ...mutedTextStyle, fontSize: '0.75rem' }}>
        {messages.about.planned}
      </p>
    </section>
  )
}
