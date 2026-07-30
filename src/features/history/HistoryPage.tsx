import { formatDate } from '../../lib/formatDate'
import { formatPrice } from '../../lib/formatPrice'
import { useHistory } from './useHistory'

export function HistoryPage({ onSelectTrip }: { onSelectTrip: (tripId: number) => void }) {
  const trips = useHistory()

  return (
    <section data-testid="history-page" style={{ maxWidth: 480, margin: '0 auto', padding: '1rem', textAlign: 'left' }}>
      <h1 style={{ fontSize: '1.5rem' }}>History</h1>

      {trips.length === 0 && <p style={{ opacity: 0.6 }}>No saved trips yet.</p>}

      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }} data-testid="history-list">
        {trips.map((trip) => (
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
    </section>
  )
}
