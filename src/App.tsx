import { DbDebugPanel } from './features/debug/DbDebugPanel'
import { ReceiptCapture } from './features/receipt-capture/ReceiptCapture'
import { ShoppingListPage } from './features/shopping-list/ShoppingListPage'

function App() {
  return (
    <main>
      <ShoppingListPage />
      <ReceiptCapture />
      <DbDebugPanel />
    </main>
  )
}

export default App
