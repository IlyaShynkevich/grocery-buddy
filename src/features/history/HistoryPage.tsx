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
        the whole page to scroll. 29rem (464px at the default root font
        size) is sized to fit ~9 trip rows — measured live from cardStyle's
        actual rendered row height (~44.375px) plus the list's 8px row gap
        (9 rows + 8 gaps = ~463px) — matching what fits on screen without
        scrolling. max-height (not height) so fewer trips, or a
        month-filtered view with few trips, still render at their natural
        height with no forced scrollbar/dead space; only content taller than
        that clips and scrolls internally. The heading, "No saved trips
        yet" message, and month filter above stay outside this container so
        they're always visible without scrolling.
      */}
      <div data-testid="history-list-scroll" style={{ maxHeight: '29rem', overflowY: 'auto' }}>
        {visibleGroups.map((group) => (
          <div key={group.key} data-testid="history-month-group" data-month-key={group.key} style={{ marginTop: '1rem' }}>
            <h2 data-testid="history-month-header" style={{ fontSize: '1.1rem', margin: '0 0 0.5rem' }}>
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
