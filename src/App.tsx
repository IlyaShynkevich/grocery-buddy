import { DbDebugPanel } from './features/debug/DbDebugPanel'
import { ShoppingListPage } from './features/shopping-list/ShoppingListPage'

function App() {
  return (
    <main>
      <ShoppingListPage />
      <DbDebugPanel />
    </main>
  )
}

export default App
