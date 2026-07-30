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
    </section>
  )
}
