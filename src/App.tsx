import { DbDebugPanel } from './features/debug/DbDebugPanel'

function App() {
  return (
    <main style={{ padding: '2rem', textAlign: 'center' }}>
      <h1>Grocery Buddy</h1>
      <p>Shopping list, receipt capture, and stats land in later milestones.</p>
      <DbDebugPanel />
    </main>
  )
}

export default App
