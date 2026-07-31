import { pageStyle } from '../../lib/ui'

// Placeholder — real content comes later. Reached only via the top-left
// Home icon (outside the swipeable tab set), same pattern as About/Customize.
export function HomePage() {
  return (
    <section data-testid="home-page" style={pageStyle}>
      <h1 style={{ fontSize: '1.5rem' }}>Home</h1>
    </section>
  )
}
