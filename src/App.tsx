import { DbDebugPanel } from './features/debug/DbDebugPanel'
import { ReceiptCapture } from './features/receipt-capture/ReceiptCapture'
import { ReceiptReviewPanel } from './features/receipt-review/ReceiptReviewPanel'
import { ShoppingListPage } from './features/shopping-list/ShoppingListPage'

function App() {
  return (
    <main>
      <ShoppingListPage />
      <ReceiptReviewPanel />
      <ReceiptCapture />
      <DbDebugPanel />
    </main>
  )
}

export default App
