import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { ACTIVE_TRIP_KEY, db, newItem, newTrip, recomputeTripTotal, type Item, type Trip } from '../../db/db'
import { CATEGORIES, resolveEssential } from '../../db/categories'
import { formatPrice } from '../../lib/formatPrice'

interface TripWithItems extends Trip {
  items: Item[]
}

async function loadTrips(): Promise<TripWithItems[]> {
  const trips = await db.trips.orderBy('date').reverse().toArray()
  return Promise.all(
    trips.map(async (trip) => ({
      ...trip,
      items: await db.items.where('tripId').equals(trip.id).toArray(),
    })),
  )
}

const SAMPLE_ITEM_NAMES = ['Milk', 'Bread', 'Chips', 'Soda', 'Apples', 'Chicken breast']

export function DbDebugPanel() {
  const [trips, setTrips] = useState<TripWithItems[]>([])
  const [selectedTripId, setSelectedTripId] = useState<number | null>(null)
  const activePointer = useLiveQuery(() => db.appState.get(ACTIVE_TRIP_KEY))

  const refresh = async () => {
    const data = await loadTrips()
    setTrips(data)
    setSelectedTripId((current) => current ?? data[0]?.id ?? null)
  }

  // Reactivity signal only: items get added/edited by flows this panel
  // doesn't own (receipt extraction), so item mutations must refresh the
  // trip list even without any action taken here. Deliberately scoped to
  // items rather than a broad live query over trips too: this panel's own
  // actions (create/reset trip) already call refresh() directly below, and
  // watching trips as well would also re-surface, on every render, the
  // still-open "reset auto-recreates an active trip in the background"
  // behavior tracked as a separate known issue.
  const itemsSignal = useLiveQuery(() => db.items.toArray(), [])

  useEffect(() => {
    if (itemsSignal !== undefined) refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsSignal])

  const createTrip = async () => {
    const id = await db.trips.add(newTrip({ store: 'Test Store' }))
    setSelectedTripId(id)
    await refresh()
  }

  const addRandomItem = async () => {
    if (selectedTripId === null) return
    const name = SAMPLE_ITEM_NAMES[Math.floor(Math.random() * SAMPLE_ITEM_NAMES.length)]
    const price = Number((Math.random() * 8 + 1).toFixed(2))
    await db.items.add(newItem(selectedTripId, { name, price, source: 'typed' }))
    await recomputeTripTotal(selectedTripId)
  }

  const updateItemCategory = async (item: Item, category: string) => {
    await db.items.update(item.id, { category })
  }

  const toggleEssentialOverride = async (item: Item) => {
    const current = resolveEssential(item)
    const next = item.essentialOverride === null ? !current : null
    await db.items.update(item.id, { essentialOverride: next })
  }

  const removeItem = async (item: Item) => {
    await db.items.delete(item.id)
    await recomputeTripTotal(item.tripId)
  }

  const makeActive = async (trip: Trip) => {
    await db.appState.put({ key: ACTIVE_TRIP_KEY, value: trip.id })
  }

  const resetAll = async () => {
    await db.trips.clear()
    await db.items.clear()
    await db.pendingReceipts.clear()
    await db.appState.clear()
    setSelectedTripId(null)
    await refresh()
  }

  return (
    <section style={{ padding: '1rem', border: '1px dashed #999', margin: '1rem', textAlign: 'left' }}>
      <h2>DB Debug Panel</h2>
      <p style={{ fontSize: '0.85rem', opacity: 0.75 }}>
        Temporary — for verifying the Dexie schema (M1). Removed once the real shopping-list /
        review UI lands.
      </p>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <button type="button" data-testid="debug-create-trip" onClick={createTrip}>
          Create test trip
        </button>
        <button type="button" onClick={addRandomItem} disabled={selectedTripId === null}>
          Add random item to selected trip
        </button>
        <button type="button" data-testid="debug-reset-all" onClick={resetAll}>
          Reset all data
        </button>
      </div>

      {trips.length === 0 && <p>No trips yet — create one to test.</p>}

      {trips.map((trip) => (
        <div
          key={trip.id}
          data-testid="debug-trip"
          data-trip-id={trip.id}
          data-active={trip.id === activePointer?.value}
          style={{
            border: trip.id === selectedTripId ? '2px solid #2e7d32' : '1px solid #ccc',
            borderRadius: 4,
            padding: '0.5rem',
            marginBottom: '0.5rem',
          }}
        >
          <label style={{ display: 'block', marginBottom: '0.25rem' }}>
            <input
              type="radio"
              name="selected-trip"
              checked={trip.id === selectedTripId}
              onChange={() => setSelectedTripId(trip.id)}
            />{' '}
            <strong>
              Trip #{trip.id} — {trip.date} — {trip.store ?? '(no store)'} — total:{' '}
              {formatPrice(trip.items.reduce((sum, item) => sum + (item.price ?? 0), 0))} — {trip.status}
              {trip.id === activePointer?.value ? ' — ACTIVE' : ''}
            </strong>
          </label>
          {trip.id !== activePointer?.value && (
            <button type="button" onClick={() => makeActive(trip)} style={{ marginBottom: '0.5rem' }}>
              Make active
            </button>
          )}
          <ul style={{ paddingLeft: '1.25rem' }}>
            {trip.items.map((item) => (
              <li key={item.id}>
                {item.name} — {formatPrice(item.price)} —{' '}
                <select value={item.category} onChange={(e) => updateItemCategory(item, e.target.value)}>
                  {CATEGORIES.map((category) => (
                    <option key={category.key} value={category.key}>
                      {category.label}
                    </option>
                  ))}
                </select>{' '}
                — essential: {String(resolveEssential(item))}{' '}
                {item.essentialOverride !== null ? '(overridden)' : '(default)'}{' '}
                <button type="button" onClick={() => toggleEssentialOverride(item)}>
                  toggle override
                </button>{' '}
                <button type="button" onClick={() => removeItem(item)}>
                  remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}
