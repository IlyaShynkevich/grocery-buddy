import { useState } from 'react'
import { DbDebugPanel } from './features/debug/DbDebugPanel'
import { Footer } from './features/footer/Footer'
import { HistoryPage } from './features/history/HistoryPage'
import { TripDetailPage } from './features/history/TripDetailPage'
import { ReceiptCapture } from './features/receipt-capture/ReceiptCapture'
import { ReceiptReviewPanel } from './features/receipt-review/ReceiptReviewPanel'
import { ShoppingListPage } from './features/shopping-list/ShoppingListPage'
import { StatsPage } from './features/stats/StatsPage'
import { PAGE_MAX_WIDTH } from './lib/ui'

type View = { name: 'shopping' } | { name: 'history' } | { name: 'trip-detail'; tripId: number } | { name: 'stats' }

const TABS: Array<{ name: View['name']; label: string; testId: string }> = [
  { name: 'shopping', label: 'Shopping List', testId: 'nav-shopping' },
  { name: 'history', label: 'History', testId: 'nav-history' },
  { name: 'stats', label: 'Stats', testId: 'nav-stats' },
]

function App() {
  const [view, setView] = useState<View>({ name: 'shopping' })
  // trip-detail isn't its own tab — it's reached via History, so it keeps
  // the History tab highlighted rather than showing no active tab at all.
  const activeTab = view.name === 'trip-detail' ? 'history' : view.name

  return (
    // A column flex layout at least one viewport tall, combined with the
    // footer's own marginTop: 'auto' (see Footer.tsx), pins the footer to
    // the true bottom of the screen — flush against the last content item
    // when content overflows the viewport, pushed down to the bottom edge
    // via the flex auto-margin when it doesn't. This also incidentally
    // keeps the earlier flow-root fix: a flex container is its own block
    // formatting context too, so <nav>'s top margin still can't collapse
    // through main/#root/body and leak above the viewport.
    <main style={{ display: 'flex', flexDirection: 'column', minHeight: '100svh' }}>
      <nav
        data-testid="app-nav"
        style={{
          display: 'flex',
          gap: '0.25rem',
          maxWidth: PAGE_MAX_WIDTH,
          margin: '0.75rem auto 0',
          padding: '0 1rem 0.75rem',
          borderBottom: '1px solid var(--border)',
        }}
      >
        {TABS.map((tab) => {
          const active = tab.name === activeTab
          return (
            <button
              key={tab.name}
              type="button"
              data-testid={tab.testId}
              onClick={() => setView({ name: tab.name } as View)}
              style={{
                background: active ? 'var(--accent)' : 'transparent',
                color: active ? 'var(--accent-contrast)' : 'inherit',
                borderColor: active ? 'var(--accent)' : 'transparent',
                fontWeight: active ? 600 : 400,
              }}
            >
              {tab.label}
            </button>
          )
        })}
      </nav>

      {view.name === 'shopping' && (
        <>
          <ShoppingListPage />
          <ReceiptReviewPanel />
          <ReceiptCapture />
        </>
      )}

      {view.name === 'history' && (
        <HistoryPage onSelectTrip={(tripId) => setView({ name: 'trip-detail', tripId })} />
      )}

      {view.name === 'trip-detail' && (
        <TripDetailPage tripId={view.tripId} onBack={() => setView({ name: 'history' })} />
      )}

      {view.name === 'stats' && <StatsPage />}

      <DbDebugPanel />
      <Footer />
    </main>
  )
}

export default App
