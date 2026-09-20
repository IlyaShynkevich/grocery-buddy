import packageJson from '../../../package.json'
import { useT } from '../../i18n'
import { PAGE_MAX_WIDTH, calloutStyle, captionStyle, displayStyle, footnoteStyle, mutedTextStyle, space, subtleTextStyle } from '../../lib/ui'
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
        gap: space.lg,
        width: '100%',
        maxWidth: PAGE_MAX_WIDTH,
        margin: '0 auto',
        padding: space.xl,
        textAlign: 'center',
      }}
    >
      <div>
        <h1 style={displayStyle}>Grocery Buddy</h1>
        <p data-testid="about-version" style={{ ...footnoteStyle, ...subtleTextStyle, marginTop: space.xs }}>
          v{packageJson.version}
        </p>
      </div>

      {/* Same negative-margin-under-the-title treatment as HomePage's
          mascot, for a consistent "standing just below it" read. */}
      <div style={{ marginTop: `-${space.md}` }}>
        <Mascot pose="thankyou" size={96} />
      </div>

      {/* Left-aligned within the otherwise-centered page — bullet text reads
          poorly center-aligned, each line's indent shifting around. */}
      <ul
        data-testid="about-description"
        style={{
          ...calloutStyle,
          textAlign: 'left',
          margin: 0,
          paddingLeft: space.xl,
          display: 'flex',
          flexDirection: 'column',
          gap: space.sm,
        }}
      >
        {messages.about.features.map((feature) => (
          <li key={feature}>{feature}</li>
        ))}
      </ul>

      <p style={{ ...footnoteStyle, fontWeight: 500 }}>Ilya Shynkevich</p>

      <p data-testid="about-access" style={{ ...captionStyle, ...mutedTextStyle }}>
        {messages.about.access}
      </p>

      <p data-testid="about-planned" style={{ ...captionStyle, ...subtleTextStyle }}>
        {messages.about.planned}
      </p>
    </section>
  )
}
