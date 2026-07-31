import { useState } from 'react'
import { formatDate } from '../../lib/formatDate'
import { formatPrice } from '../../lib/formatPrice'
import { cardStyle, mutedTextStyle, pageStyle } from '../../lib/ui'
import { groupTripsByMonth, useHistory } from './useHistory'

export function HistoryPage({ onSelectTrip }: { onSelectTrip: (tripId: number) => void }) {
  const trips = useHistory()
  const groups = groupTripsByMonth(trips)
  const [monthFilter, setMonthFilter] = useState('')

  const visibleGroups = monthFilter ? groups.filter((group) => group.key === monthFilter) : groups

  return (
    <section data-testid="history-page" style={pageStyle}>
      <h1 style={{ fontSize: '1.5rem' }}>History</h1>

      {trips.length === 0 && <p style={{ ...mutedTextStyle, marginTop: '0.75rem' }}>No saved trips yet.</p>}

      {groups.length > 1 && (
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0.75rem 0' }}>
          Filter by month:
          <select data-testid="history-month-select" value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)}>
            <option value="">All months</option>
            {groups.map((group) => (
              <option key={group.key} value={group.key}>
                {group.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {/*
        Fixed max-height, not an unbounded page: without this, a long
        history pushes Debug tools/the footer down and off-screen, requiring
        the whole page to scroll. 32.25rem (516px at the default root font
        size) is sized to fit exactly 9 trip rows plus one month header —
        measured live (not guessed) against a real npm run preview build:
        cardStyle's actual rendered row height is 44.375px, the list's row
        gap is 8px, and a month header (with its own 8px margin-bottom) plus
        the group wrapper's 1rem top margin adds 49.5px of fixed overhead
        above the rows (sticky, see below, doesn't change how much space it
        occupies — only whether it's pinned). 49.5 + 9*44.375 + 8*8 =
        512.875px; 516px leaves a few px of slack, same margin the previous
        (wrong) 464px value left for what turned out to be only 8 rows — that
        value never accounted for the header/margin overhead at all, which
        is what shorted it by a full row. max-height (not height) so fewer
        trips, or a month-filtered view with few trips, still render at
        their natural height with no forced scrollbar/dead space; only
        content taller than that clips and scrolls internally. The heading,
        "No saved trips yet" message, and month filter above stay outside
        this container so they're always visible without scrolling.
      */}
      <div data-testid="history-list-scroll" style={{ maxHeight: '32.25rem', overflowY: 'auto' }}>
        {visibleGroups.map((group) => (
          <div key={group.key} data-testid="history-month-group" data-month-key={group.key} style={{ marginTop: '1rem' }}>
            {/*
              position: sticky (not static) — the standard "swapping section
              header" pattern (contact lists, calendars): each month's header
              sticks to the top of the scrollable container for as long as
              any of that month's rows are in view, then is pushed off by
              the next month's header once its own group has fully scrolled
              past, which is what makes the pinned label "swap" to the new
              month automatically. No JS scroll tracking needed — this falls
              out of every group having its own sticky header stacked in
              normal document order. background matches the page (not
              --surface, which is the row cards' color) so scrolled-past rows
              don't show through underneath the pinned label; zIndex keeps it
              above those rows too, since sticky doesn't imply a paint order.
            */}
            <h2
              data-testid="history-month-header"
              style={{ fontSize: '1.1rem', margin: '0 0 0.5rem', position: 'sticky', top: 0, background: 'var(--bg)', zIndex: 1 }}
            >
              {group.label}
            </h2>
            <ul
              style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}
              data-testid="history-list"
            >
              {group.trips.map((trip) => (
                <li key={trip.id}>
                  <button
                    type="button"
                    data-testid="history-trip"
                    data-trip-id={trip.id}
                    onClick={() => onSelectTrip(trip.id)}
                    style={{ ...cardStyle, display: 'flex', justifyContent: 'space-between', width: '100%', textAlign: 'left' }}
                  >
                    <span>
                      {formatDate(trip.date)}
                      {trip.store ? ` — ${trip.store}` : ''}
                    </span>
                    <span style={mutedTextStyle}>
                      {trip.itemCount} item{trip.itemCount === 1 ? '' : 's'} — {formatPrice(trip.total)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}
