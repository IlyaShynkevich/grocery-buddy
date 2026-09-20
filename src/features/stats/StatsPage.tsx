import { useState, type CSSProperties } from 'react'
import { categoryLabel, useT } from '../../i18n'
import { formatPrice } from '../../lib/formatPrice'
import { calloutStyle, cardStyle, footnoteStyle, mutedTextStyle, numericStyle, pageStyle, space, titleStyle } from '../../lib/ui'
import { Mascot } from '../mascot/Mascot'
import { useMonthlyStats, useStatsMonths, type MonthlyStats } from './useMonthlyStats'

const barTrackStyle: CSSProperties = {
  flex: 1,
  background: 'var(--border)',
  borderRadius: 999,
  overflow: 'hidden',
  height: space.sm,
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

/** Total, essential split and category breakdown for one currency's trips. */
function CurrencyStats({ stats, showCurrency }: { stats: MonthlyStats; showCurrency: boolean }) {
  const messages = useT()
  const price = (amount: number) => formatPrice(amount, stats.currency)
  const maxCategoryAmount = Math.max(0, ...stats.categories.map((c) => c.amount))
  const maxSplitAmount = Math.max(0, stats.essential, stats.nonEssential)

  // Sized so a month with all 11 categories fits a 393x777 phone viewport
  // in both English and Russian: the total shares the first card instead of
  // having its own, and category rows are a little denser (still >= 14px).
  return (
    <div data-testid="stats-currency-block" data-currency={stats.currency} style={{ display: 'flex', flexDirection: 'column', gap: space.lg }}>
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: space.md, marginBottom: space.lg }}>
          <span style={{ ...footnoteStyle, ...mutedTextStyle }}>
            {messages.stats.totalSpend}
            {showCurrency && ` · ${stats.currency}`}
          </span>
          {/* The one number the page exists for — title-sized, tabular, and
              the only thing at this weight anywhere on the screen. */}
          <p data-testid="stats-total" style={{ ...titleStyle, ...numericStyle }}>
            {price(stats.total)}
          </p>
        </div>
        <h2 style={{ marginBottom: space.md }}>{messages.stats.essentialVsNon}</h2>
        <div data-testid="stats-essential-split" style={{ ...calloutStyle, display: 'flex', flexDirection: 'column', gap: space.sm }}>
          <div data-testid="stats-split-essential" style={{ display: 'flex', alignItems: 'center', gap: space.md }}>
            <span style={{ width: '8.5rem', flexShrink: 0 }}>{messages.stats.essential}</span>
            <div style={barTrackStyle}>
              <div style={{ ...barFillStyle, width: barWidth(stats.essential, maxSplitAmount), background: 'var(--accent)' }} />
            </div>
            <span data-testid="stats-split-essential-amount" style={{ ...numericStyle, width: '5rem', textAlign: 'right' }}>
              {price(stats.essential)}
            </span>
          </div>
          <div data-testid="stats-split-non-essential" style={{ display: 'flex', alignItems: 'center', gap: space.md }}>
            <span style={{ width: '8.5rem', flexShrink: 0, ...mutedTextStyle }}>{messages.stats.nonEssential}</span>
            <div style={barTrackStyle}>
              <div style={{ ...barFillStyle, width: barWidth(stats.nonEssential, maxSplitAmount), background: 'var(--border-strong)' }} />
            </div>
            <span data-testid="stats-split-non-essential-amount" style={{ ...numericStyle, width: '5rem', textAlign: 'right', ...mutedTextStyle }}>
              {price(stats.nonEssential)}
            </span>
          </div>
        </div>
      </div>

      <div style={cardStyle}>
        <h2 style={{ marginBottom: space.md }}>{messages.stats.byCategory}</h2>
        {stats.categories.length === 0 ? (
          <p data-testid="stats-empty" style={mutedTextStyle}>
            {messages.stats.noItemsThisMonth}
          </p>
        ) : (
          <div data-testid="stats-category-chart" style={{ ...calloutStyle, display: 'flex', flexDirection: 'column', gap: space.sm }}>
            {stats.categories.map((category) => (
              <div key={category.key} data-testid="stats-category-bar" data-category-key={category.key} style={{ display: 'flex', alignItems: 'center', gap: space.md }}>
                <span data-testid="stats-category-label" style={{ width: '10rem', flexShrink: 0 }}>
                  {categoryLabel(messages, category.key)}
                </span>
                <div style={barTrackStyle}>
                  <div style={{ ...barFillStyle, width: barWidth(category.amount, maxCategoryAmount), background: 'var(--accent)' }} />
                </div>
                <span data-testid="stats-category-amount" style={{ ...numericStyle, width: '5rem', textAlign: 'right' }}>
                  {price(category.amount)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function StatsPage() {
  const messages = useT()
  const groups = useStatsMonths()
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  const activeKey = selectedKey && groups.some((group) => group.key === selectedKey) ? selectedKey : (groups[0]?.key ?? null)
  const group = groups.find((g) => g.key === activeKey)
  const stats = useMonthlyStats(group)
  const mixedCurrencies = stats !== null && stats.length > 1

  return (
    <section data-testid="stats-page" style={pageStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1>{messages.stats.title}</h1>
        <Mascot pose="onit" size={32} />
      </div>

      {groups.length === 0 && (
        <p data-testid="stats-empty" style={{ ...mutedTextStyle, marginTop: space.lg }}>
          {messages.stats.noTrips}
        </p>
      )}

      {groups.length > 0 && (
        <>
          <label style={{ display: 'flex', alignItems: 'center', gap: space.md, margin: `${space.lg} 0` }}>
            {messages.stats.month}
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
              {messages.stats.noTripsThisMonth}
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: space['2xl'] }}>
              {mixedCurrencies && (
                <p data-testid="stats-mixed-currencies" style={{ ...footnoteStyle, ...mutedTextStyle }}>
                  {messages.stats.mixedCurrencies}
                </p>
              )}
              {stats.map((currencyStats) => (
                <CurrencyStats key={currencyStats.currency} stats={currencyStats} showCurrency={mixedCurrencies} />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  )
}
