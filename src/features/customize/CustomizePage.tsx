import { pageStyle } from '../../lib/ui'

// Placeholder — real content comes in a later task. Unlike Home/About, this
// is a real member of the swipeable tab set (4th middle tab), so it slides
// in/out via TabTransition and participates in swipe navigation like
// Shopping List/History/Stats.
export function CustomizePage() {
  return (
    <section data-testid="customize-page" style={pageStyle}>
      <h1 style={{ fontSize: '1.5rem' }}>Customize</h1>
    </section>
  )
}
