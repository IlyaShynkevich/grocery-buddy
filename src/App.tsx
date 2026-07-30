import { useState } from 'react'
import { DbDebugPanel } from './features/debug/DbDebugPanel'
import { HistoryPage } from './features/history/HistoryPage'
import { TripDetailPage } from './features/history/TripDetailPage'
import { ReceiptCapture } from './features/receipt-capture/ReceiptCapture'
import { ReceiptReviewPanel } from './features/receipt-review/ReceiptReviewPanel'
import { ShoppingListPage } from './features/shopping-list/ShoppingListPage'

type View = { name: 'shopping' } | { name: 'history' } | { name: 'trip-detail'; tripId: number }

function App() {
  const [view, setView] = useState<View>({ name: 'shopping' })

  return (
    <main>
      <nav
        data-testid="app-nav"
        style={{ display: 'flex', gap: '0.5rem', maxWidth: 480, margin: '0.5rem auto 0', padding: '0 1rem' }}
      >
        <button type="button" data-testid="nav-shopping" onClick={() => setView({ name: 'shopping' })}>
          Shopping List
        </button>
        <button type="button" data-testid="nav-history" onClick={() => setView({ name: 'history' })}>
          History
        </button>
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

      <DbDebugPanel />
    </main>
  )
}

export default App
