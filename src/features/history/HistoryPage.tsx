import { useState } from 'react'
import { formatDate } from '../../lib/formatDate'
import { formatPrice } from '../../lib/formatPrice'
import { groupTripsByMonth, useHistory } from './useHistory'

export function HistoryPage({ onSelectTrip }: { onSelectTrip: (tripId: number) => void }) {
  const trips = useHistory()
  const groups = groupTripsByMonth(trips)
  const [monthFilter, setMonthFilter] = useState('')

  const visibleGroups = monthFilter ? groups.filter((group) => group.key === monthFilter) : groups

  return (
    <section data-testid="history-page" style={{ maxWidth: 480, margin: '0 auto', padding: '1rem', textAlign: 'left' }}>
      <h1 style={{ fontSize: '1.5rem' }}>History</h1>

      {trips.length === 0 && <p style={{ opacity: 0.6 }}>No saved trips yet.</p>}

      {groups.length > 1 && (
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
          Filter by month:
          <select
            data-testid="history-month-select"
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            style={{ padding: '0.3rem' }}
          >
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
        <div key={group.key} data-testid="history-month-group" data-month-key={group.key}>
          <h2 data-testid="history-month-header" style={{ fontSize: '1.1rem', margin: '0.75rem 0 0.25rem' }}>
            {group.label}
          </h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }} data-testid="history-list">
            {group.trips.map((trip) => (
              <li key={trip.id}>
                <button
                  type="button"
                  data-testid="history-trip"
                  data-trip-id={trip.id}
                  onClick={() => onSelectTrip(trip.id)}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    width: '100%',
                    padding: '0.6rem 0',
                    borderBottom: '1px solid #e0e0e0',
                    background: 'none',
                    textAlign: 'left',
                  }}
                >
                  <span>
                    {formatDate(trip.date)}
                    {trip.store ? ` — ${trip.store}` : ''}
                  </span>
                  <span>
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
