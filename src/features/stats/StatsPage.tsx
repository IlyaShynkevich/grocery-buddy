import { useState, type CSSProperties } from 'react'
import { formatPrice } from '../../lib/formatPrice'
import { useMonthlyStats, useStatsMonths } from './useMonthlyStats'

const barTrackStyle: CSSProperties = {
  flex: 1,
  background: '#eee',
  borderRadius: 4,
  overflow: 'hidden',
  height: '1rem',
}

/**
 * Bar width as a percentage of `max`, clamped to [0, 100] — a category or
 * essential/non-essential bucket can go negative when a discount outweighs
 * the real purchases folded into it (see useMonthlyStats), and a negative
 * CSS width is invalid, so that just renders as an empty bar rather than
 * something broken.
 */
function barWidth(amount: number, max: number): string {
  if (max <= 0) return '0%'
  return `${Math.min(100, Math.max(0, (amount / max) * 100))}%`
}

export function StatsPage() {
  const groups = useStatsMonths()
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  const activeKey = selectedKey && groups.some((group) => group.key === selectedKey) ? selectedKey : (groups[0]?.key ?? null)
  const group = groups.find((g) => g.key === activeKey)
  const stats = useMonthlyStats(group)

  const maxCategoryAmount = stats ? Math.max(0, ...stats.categories.map((c) => c.amount)) : 0
  const maxSplitAmount = stats ? Math.max(0, stats.essential, stats.nonEssential) : 0

  return (
    <section data-testid="stats-page" style={{ maxWidth: 480, margin: '0 auto', padding: '1rem', textAlign: 'left' }}>
      <h1 style={{ fontSize: '1.5rem' }}>Stats</h1>

      {groups.length === 0 && (
        <p data-testid="stats-empty" style={{ opacity: 0.6 }}>
          No completed trips yet — save a trip to see stats.
        </p>
      )}

      {groups.length > 0 && (
        <>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            Month:
            <select
              data-testid="stats-month-select"
              value={activeKey ?? ''}
              onChange={(e) => setSelectedKey(e.target.value)}
              style={{ padding: '0.3rem' }}
            >
              {groups.map((g) => (
                <option key={g.key} value={g.key}>
                  {g.label}
                </option>
              ))}
            </select>
          </label>

          {stats === null ? (
            <p data-testid="stats-empty" style={{ opacity: 0.6 }}>
              No completed trips for this month.
            </p>
          ) : (
            <>
              <p data-testid="stats-total" style={{ fontWeight: 'bold' }}>
                Total: {formatPrice(stats.total)}
              </p>

              <h2 style={{ fontSize: '1.1rem', marginTop: '1rem' }}>Essential vs. non-essential</h2>
              <div data-testid="stats-essential-split" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <div data-testid="stats-split-essential" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ width: '6.5rem', flexShrink: 0 }}>Essential</span>
                  <div style={barTrackStyle}>
                    <div
                      style={{
                        width: barWidth(stats.essential, maxSplitAmount),
                        background: '#2e7d32',
                        height: '100%',
                      }}
                    />
                  </div>
                  <span data-testid="stats-split-essential-amount" style={{ width: '5rem', textAlign: 'right' }}>
                    {formatPrice(stats.essential)}
                  </span>
                </div>
                <div data-testid="stats-split-non-essential" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ width: '6.5rem', flexShrink: 0 }}>Non-essential</span>
                  <div style={barTrackStyle}>
                    <div
                      style={{
                        width: barWidth(stats.nonEssential, maxSplitAmount),
                        background: '#e65100',
                        height: '100%',
                      }}
                    />
                  </div>
                  <span data-testid="stats-split-non-essential-amount" style={{ width: '5rem', textAlign: 'right' }}>
                    {formatPrice(stats.nonEssential)}
                  </span>
                </div>
              </div>

              <h2 style={{ fontSize: '1.1rem', marginTop: '1.25rem' }}>Spend by category</h2>
              {stats.categories.length === 0 ? (
                <p data-testid="stats-empty" style={{ opacity: 0.6 }}>
                  No purchased items this month.
                </p>
              ) : (
                <div data-testid="stats-category-chart" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {stats.categories.map((category) => (
                    <div
                      key={category.key}
                      data-testid="stats-category-bar"
                      data-category-key={category.key}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                    >
                      <span data-testid="stats-category-label" style={{ width: '9rem', flexShrink: 0 }}>
                        {category.label}
                      </span>
                      <div style={barTrackStyle}>
                        <div
                          style={{
                            width: barWidth(category.amount, maxCategoryAmount),
                            background: '#1565c0',
                            height: '100%',
                          }}
                        />
                      </div>
                      <span data-testid="stats-category-amount" style={{ width: '5rem', textAlign: 'right' }}>
                        {formatPrice(category.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </section>
  )
}
