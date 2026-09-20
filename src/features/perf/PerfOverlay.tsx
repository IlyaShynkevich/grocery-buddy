import { useState, useSyncExternalStore } from 'react'
import { clearPerfLog, getPerfEntries, getPerfStorageError, subscribePerfLog, type PerfEntry } from './perfLog'

/** TEMPORARY — see perfLog.ts. Rendered only with ?perf=1. */

function formatClock(t: number): string {
  const d = new Date(t)
  const pad = (n: number, width = 2) => String(n).padStart(width, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`
}

function formatLog(entries: PerfEntry[]): string {
  return entries
    .map((entry, i) => {
      const delta = i === 0 ? 0 : entry.t - entries[i - 1].t
      return `${formatClock(entry.t)}  +${delta}ms  ${entry.label}`
    })
    .join('\n')
}

export function PerfOverlay() {
  const entries = useSyncExternalStore(subscribePerfLog, getPerfEntries)
  const storageError = getPerfStorageError()
  const [minimized, setMinimized] = useState(false)
  const [copyStatus, setCopyStatus] = useState<string | null>(null)

  const copy = () => {
    setCopyStatus(null)
    navigator.clipboard.writeText(formatLog(entries)).then(
      () => setCopyStatus('Copied'),
      (err: unknown) => {
        console.error('Perf log: copy failed', err)
        setCopyStatus(`Copy failed: ${err instanceof Error ? err.message : String(err)}`)
      },
    )
  }

  return (
    <div
      data-testid="perf-overlay"
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1000,
        maxHeight: minimized ? undefined : '40vh',
        overflowY: 'auto',
        padding: '0.4rem 0.6rem',
        background: 'var(--surface)',
        borderTop: '2px solid var(--border-strong)',
        fontFamily: 'monospace',
        fontSize: 'var(--text-caption)',
        textAlign: 'left',
      }}
    >
      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', marginBottom: minimized ? 0 : '0.3rem' }}>
        <strong style={{ flex: 1 }}>perf log ({entries.length})</strong>
        <button type="button" onClick={copy} style={{ padding: '0.2rem 0.5rem' }}>
          Copy
        </button>
        <button type="button" data-testid="perf-overlay-clear" onClick={clearPerfLog} style={{ padding: '0.2rem 0.5rem' }}>
          Clear
        </button>
        <button type="button" onClick={() => setMinimized((m) => !m)} style={{ padding: '0.2rem 0.5rem' }}>
          {minimized ? 'Show' : 'Hide'}
        </button>
      </div>
      {copyStatus && <div>{copyStatus}</div>}
      {storageError && (
        <div role="alert" style={{ color: 'var(--danger)' }}>
          {storageError}
        </div>
      )}
      {!minimized && (
        <pre data-testid="perf-overlay-log" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
          {formatLog(entries)}
        </pre>
      )}
    </div>
  )
}
