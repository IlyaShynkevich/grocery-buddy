import { pageStyle } from '../../lib/ui'

// Placeholder — real content comes later. Reached only via the top-right
// About icon (outside the swipeable tab set), same pattern as Home/Customize.
export function AboutPage() {
  return (
    <section data-testid="about-page" style={pageStyle}>
      <h1 style={{ fontSize: '1.5rem' }}>About</h1>
    </section>
  )
}
