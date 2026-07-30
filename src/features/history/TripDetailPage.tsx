import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { resolveEssential } from '../../db/categories'
import { db, deleteTrip } from '../../db/db'
import { formatDate } from '../../lib/formatDate'
import { formatPrice } from '../../lib/formatPrice'

// Otherwise read-only by construction: no inputs, no per-item remove
// buttons, nothing that mutates db.items — a completed trip is done, this
// is just for looking back at what was bought. The one mutation is
// deleting the whole trip, which is gated behind an explicit confirmation
// step since it's destructive and irreversible.
export function TripDetailPage({ tripId, onBack }: { tripId: number; onBack: () => void }) {
  const trip = useLiveQuery(() => db.trips.get(tripId), [tripId])
  const items = useLiveQuery(() => db.items.where('tripId').equals(tripId).sortBy('id'), [tripId], [])
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const regularItems = items.filter((item) => !item.isDiscount)
  const discountItems = items.filter((item) => item.isDiscount)

  const handleDelete = async () => {
    await deleteTrip(tripId)
    onBack()
  }

  return (
    <section data-testid="trip-detail-page" style={{ maxWidth: 480, margin: '0 auto', padding: '1rem', textAlign: 'left' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
        <button type="button" data-testid="trip-detail-back" onClick={onBack} style={{ padding: '0.3rem 0.6rem' }}>
          ← Back to history
        </button>
        {!confirmingDelete && (
          <button
            type="button"
            data-testid="trip-detail-delete"
            onClick={() => setConfirmingDelete(true)}
            style={{ padding: '0.3rem 0.6rem', color: '#c62828' }}
          >
            Delete trip
          </button>
        )}
      </div>

      {confirmingDelete && (
        <div
          data-testid="trip-detail-delete-confirm"
          style={{ border: '1px solid #c62828', borderRadius: 4, padding: '0.6rem', margin: '0.75rem 0' }}
        >
          <p style={{ margin: '0 0 0.5rem' }}>Delete this trip? This can't be undone.</p>
          <button
            type="button"
            data-testid="trip-detail-delete-yes"
            onClick={handleDelete}
            style={{ padding: '0.3rem 0.6rem', marginRight: '0.5rem', color: '#c62828' }}
          >
            Yes, delete
          </button>
          <button type="button" data-testid="trip-detail-delete-cancel" onClick={() => setConfirmingDelete(false)} style={{ padding: '0.3rem 0.6rem' }}>
            Cancel
          </button>
        </div>
      )}

      <h1 style={{ fontSize: '1.5rem', marginTop: '0.75rem' }}>{trip ? formatDate(trip.date) : 'Loading…'}</h1>
      {trip?.store && <p style={{ opacity: 0.7 }}>{trip.store}</p>}
      <p data-testid="trip-detail-total" style={{ fontWeight: 'bold' }}>
        Total: {formatPrice(trip?.total ?? null)}
      </p>

      <ul style={{ listStyle: 'none', padding: 0, margin: '0.75rem 0 0' }} data-testid="trip-detail-items">
        {regularItems.map((item) => {
          const essential = resolveEssential(item)
          return (
            <li
              key={item.id}
              data-testid="trip-detail-item"
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0', borderBottom: '1px solid #e0e0e0' }}
            >
              <span>{item.name}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span
                  data-testid="trip-detail-item-essential"
                  data-essential={essential}
                  style={{
                    fontSize: '0.7rem',
                    padding: '0.1rem 0.4rem',
                    borderRadius: 4,
                    background: essential ? '#e8f5e9' : '#fff3e0',
                    color: essential ? '#2e7d32' : '#e65100',
                  }}
                >
                  {essential ? 'essential' : 'non-essential'}
                </span>
                <span>{formatPrice(item.price)}</span>
              </span>
            </li>
          )
        })}
      </ul>

      {discountItems.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: '0.5rem 0 0' }} data-testid="trip-detail-discounts">
          {discountItems.map((item) => (
            <li
              key={item.id}
              data-testid="trip-detail-discount"
              style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0', fontStyle: 'italic', opacity: 0.8 }}
            >
              <span>{item.name}</span>
              <span>{formatPrice(item.price)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
