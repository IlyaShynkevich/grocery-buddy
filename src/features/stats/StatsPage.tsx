import { useState, type CSSProperties } from 'react'
import { formatPrice } from '../../lib/formatPrice'
import { cardStyle, mutedTextStyle, pageStyle } from '../../lib/ui'
import { Mascot } from '../mascot/Mascot'
import { useMonthlyStats, useStatsMonths } from './useMonthlyStats'

const barTrackStyle: CSSProperties = {
  flex: 1,
  background: 'var(--border)',
  borderRadius: 999,
  overflow: 'hidden',
  height: '0.6rem',
}

const barFillStyle: CSSProperties = {
  height: '100%',
  borderRadius: 999,
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
    <section data-testid="stats-page" style={pageStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: '1.5rem' }}>Stats</h1>
        <Mascot pose="onit" size={32} />
      </div>

      {groups.length === 0 && (
        <p data-testid="stats-empty" style={{ ...mutedTextStyle, marginTop: '0.75rem' }}>
          No completed trips yet — save a trip to see stats.
        </p>
      )}

      {groups.length > 0 && (
        <>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0.75rem 0 1rem' }}>
            Month:
            <select data-testid="stats-month-select" value={activeKey ?? ''} onChange={(e) => setSelectedKey(e.target.value)}>
              {groups.map((g) => (
                <option key={g.key} value={g.key}>
                  {g.label}
                </option>
              ))}
            </select>
          </label>

          {stats === null ? (
            <p data-testid="stats-empty" style={mutedTextStyle}>
              No completed trips for this month.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={cardStyle}>
                <span style={{ ...mutedTextStyle, fontSize: '0.8rem' }}>Total spend</span>
                <p data-testid="stats-total" style={{ fontSize: '1.4rem', fontWeight: 700, marginTop: '0.15rem' }}>
                  {formatPrice(stats.total)}
                </p>
              </div>

              <div style={cardStyle}>
                <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>Essential vs. non-essential</h2>
                <div data-testid="stats-essential-split" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div data-testid="stats-split-essential" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <span style={{ width: '6.5rem', flexShrink: 0 }}>Essential</span>
                    <div style={barTrackStyle}>
                      <div style={{ ...barFillStyle, width: barWidth(stats.essential, maxSplitAmount), background: 'var(--accent)' }} />
                    </div>
                    <span data-testid="stats-split-essential-amount" style={{ width: '5rem', textAlign: 'right' }}>
                      {formatPrice(stats.essential)}
                    </span>
                  </div>
                  <div data-testid="stats-split-non-essential" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <span style={{ width: '6.5rem', flexShrink: 0, ...mutedTextStyle }}>Non-essential</span>
                    <div style={barTrackStyle}>
                      <div style={{ ...barFillStyle, width: barWidth(stats.nonEssential, maxSplitAmount), background: 'var(--border-strong)' }} />
                    </div>
                    <span data-testid="stats-split-non-essential-amount" style={{ width: '5rem', textAlign: 'right', ...mutedTextStyle }}>
                      {formatPrice(stats.nonEssential)}
                    </span>
                  </div>
                </div>
              </div>

              <div style={cardStyle}>
                <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>Spend by category</h2>
                {stats.categories.length === 0 ? (
                  <p data-testid="stats-empty" style={mutedTextStyle}>
                    No purchased items this month.
                  </p>
                ) : (
                  <div data-testid="stats-category-chart" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {stats.categories.map((category) => (
                      <div key={category.key} data-testid="stats-category-bar" data-category-key={category.key} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <span data-testid="stats-category-label" style={{ width: '9rem', flexShrink: 0 }}>
                          {category.label}
                        </span>
                        <div style={barTrackStyle}>
                          <div style={{ ...barFillStyle, width: barWidth(category.amount, maxCategoryAmount), background: 'var(--accent)' }} />
                        </div>
                        <span data-testid="stats-category-amount" style={{ width: '5rem', textAlign: 'right' }}>
                          {formatPrice(category.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  )
}
