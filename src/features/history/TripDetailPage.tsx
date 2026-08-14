import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { resolveEssential } from '../../db/categories'
import { db, deleteTrip } from '../../db/db'
import { formatDate } from '../../lib/formatDate'
import { formatPrice } from '../../lib/formatPrice'
import { cardStyle, dangerButtonStyle, dangerFilledButtonStyle, mutedTextStyle, pageStyle } from '../../lib/ui'

// Otherwise read-only by construction: no inputs, no per-item remove
// buttons, nothing that mutates db.items — a completed trip is done, this
// is just for looking back at what was bought. The two mutations are
// deleting the whole trip (gated behind an explicit confirmation step
// since it's destructive and irreversible) and toggling an item's
// essential/non-essential badge, which is safe to leave editable even on
// a completed trip — it's a personal classification, not a record of what
// happened, and Stats picks up the change live since it queries db.items
// directly rather than trusting a snapshot.
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

  // Literal-boolean write, per resolveEssential's contract: the badge always
  // shows the resolved status, so toggling it writes that status's literal
  // opposite — never a delta off the raw (possibly-null) essentialOverride.
  const toggleEssential = async (item: (typeof items)[number]) => {
    await db.items.update(item.id, { essentialOverride: !resolveEssential(item) })
  }

  return (
    <section data-testid="trip-detail-page" style={pageStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
        <button type="button" data-testid="trip-detail-back" onClick={onBack}>
          ← Back to history
        </button>
        {!confirmingDelete && (
          <button type="button" data-testid="trip-detail-delete" onClick={() => setConfirmingDelete(true)} style={dangerButtonStyle}>
            Delete trip
          </button>
        )}
      </div>

      {confirmingDelete && (
        <div
          data-testid="trip-detail-delete-confirm"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--danger)',
            borderRadius: 'var(--radius)',
            padding: '0.75rem',
            margin: '0.75rem 0',
          }}
        >
          <p style={{ marginBottom: '0.6rem' }}>Delete this trip? This can't be undone.</p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="button" data-testid="trip-detail-delete-yes" onClick={handleDelete} style={dangerFilledButtonStyle}>
              Yes, delete
            </button>
            <button type="button" data-testid="trip-detail-delete-cancel" onClick={() => setConfirmingDelete(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <h1 style={{ fontSize: '1.5rem', marginTop: '0.75rem' }}>{trip ? formatDate(trip.date) : 'Loading…'}</h1>
      {trip?.store && <p style={{ ...mutedTextStyle, marginTop: '0.2rem' }}>{trip.store}</p>}
      <p data-testid="trip-detail-total" style={{ fontWeight: 700, marginTop: '0.4rem' }}>
        Total: {formatPrice(trip?.total ?? null)}
      </p>

      <ul
        style={{ listStyle: 'none', padding: 0, margin: '1rem 0 0', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}
        data-testid="trip-detail-items"
      >
        {regularItems.map((item) => {
          const essential = resolveEssential(item)
          return (
            <li key={item.id} data-testid="trip-detail-item" style={{ ...cardStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{item.name}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <button
                  type="button"
                  data-testid="trip-detail-item-essential"
                  data-essential={essential}
                  onClick={() => toggleEssential(item)}
                  aria-label={`Mark ${item.name} as ${essential ? 'non-essential' : 'essential'}`}
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    padding: '0.35rem 0.6rem',
                    minHeight: '1.75rem',
                    borderRadius: 999,
                    background: essential ? 'var(--accent)' : 'transparent',
                    color: essential ? 'var(--accent-contrast)' : 'var(--text-muted)',
                    border: essential ? 'none' : '1px solid var(--border-strong)',
                    cursor: 'pointer',
                    lineHeight: 1,
                  }}
                >
                  {essential ? 'essential' : 'non-essential'}
                </button>
                <span>{formatPrice(item.price)}</span>
              </span>
            </li>
          )
        })}
      </ul>

      {discountItems.length > 0 && (
        <ul
          style={{ listStyle: 'none', padding: 0, margin: '0.5rem 0 0', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}
          data-testid="trip-detail-discounts"
        >
          {discountItems.map((item) => (
            <li
              key={item.id}
              data-testid="trip-detail-discount"
              style={{
                ...mutedTextStyle,
                display: 'flex',
                justifyContent: 'space-between',
                padding: '0.4rem 0.75rem',
                border: '1px dashed var(--border)',
                borderRadius: 'var(--radius)',
                fontStyle: 'italic',
              }}
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
