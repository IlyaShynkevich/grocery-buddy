import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { ACTIVE_TRIP_KEY, db, newItem, newTrip, recomputeTripTotal, resetAllData, type Item, type Trip } from '../../db/db'
import { CATEGORIES, resolveEssential } from '../../db/categories'
import { formatPrice } from '../../lib/formatPrice'
import { pageStyle } from '../../lib/ui'

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
  const [dateEditError, setDateEditError] = useState<string | null>(null)
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
  // actions (create/reset trip) already call refresh() directly below, so a
  // trips-level query would just be redundant reactivity, not additional
  // correctness.
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

  /**
   * Corrective tool for backfilling historical trips: a trip's date is
   * otherwise only ever set at creation (always "today"), so re-entering a
   * month's worth of receipts by hand after a data loss would leave every
   * one of them dated today instead of its real purchase date without this.
   * Writes straight through Dexie (not raw IndexedDB, unlike some e2e test
   * helpers), so the live-query-driven History/Stats views pick the change
   * up immediately on their own. This panel's own `trips` list is *not* a
   * live query though — it's plain state, normally refreshed only by the
   * itemsSignal effect above whenever db.items changes — so without an
   * explicit refresh() here, a date edit (which touches only db.trips)
   * would leave this panel showing the stale date and the controlled
   * <input> snapping back to it on the next unrelated render.
   */
  const updateTripDate = async (trip: Trip, newDate: string) => {
    if (!newDate) return
    setDateEditError(null)
    try {
      await db.trips.update(trip.id, { date: newDate })
      await refresh()
    } catch (err) {
      console.error('Grocery Buddy debug panel: failed to update trip date', err)
      setDateEditError(err instanceof Error ? err.message : String(err))
    }
  }

  const resetAll = async () => {
    // See resetAllData's own doc comment (db.ts) for why this can't just be
    // four separate .clear() calls — it needs to wipe and re-pin a fresh
    // draft as one atomic transaction, or other mounted components racing
    // to self-heal the missing active-trip pointer leave 1-2 unpredictable
    // extra trips behind.
    await resetAllData()
    setSelectedTripId(null)
    await refresh()
  }

  return (
    // Collapsed by default (no `open` attribute) — this is a developer tool,
    // not part of the real app, so it shouldn't take up visual space or look
    // like a shipped feature. Still fully reachable for our own testing:
    // native <details> keeps its children in the DOM either way, just not
    // rendered until opened, so e2e tests just need to click the toggle
    // first before interacting with anything inside.
    <details data-testid="debug-panel" style={pageStyle}>
      <summary
        data-testid="debug-panel-toggle"
        style={{ padding: '0.4rem 0.6rem', border: '1px dashed var(--border-strong)', borderRadius: 4, color: 'var(--text-muted)' }}
      >
        Debug tools ▸
      </summary>
      <div style={{ padding: '1rem', border: '1px dashed var(--border-strong)', borderTop: 'none' }}>
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

        {dateEditError && (
          <p role="alert" data-testid="debug-trip-date-error" style={{ color: 'var(--danger)' }}>
            Failed to update trip date: {dateEditError}
          </p>
        )}

        {trips.length === 0 && <p>No trips yet — create one to test.</p>}

        {trips.map((trip) => (
          <div
            key={trip.id}
            data-testid="debug-trip"
            data-trip-id={trip.id}
            data-active={trip.id === activePointer?.value}
            style={{
              border: trip.id === selectedTripId ? '2px solid var(--border-strong)' : '1px solid var(--border)',
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
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
              Edit date:
              <input
                type="date"
                data-testid="debug-trip-date-input"
                value={trip.date}
                onChange={(e) => updateTripDate(trip, e.target.value)}
              />
            </label>
            {trip.id !== activePointer?.value && (
              <button type="button" data-testid="debug-make-active" onClick={() => makeActive(trip)} style={{ marginBottom: '0.5rem' }}>
                Make active
              </button>
            )}
            <ul style={{ paddingLeft: '1.25rem' }}>
              {trip.items.map((item) =>
                item.isDiscount ? (
                  // Discount/coupon lines are internal accounting entries, not
                  // purchased products — no category or essential/non-essential
                  // concept applies, so they get a plain deduction row instead
                  // of the item controls below.
                  <li key={item.id} data-testid="debug-discount-item">
                    {item.name} — {formatPrice(item.price)} (discount){' '}
                    <button type="button" onClick={() => removeItem(item)}>
                      remove
                    </button>
                  </li>
                ) : (
                  <li key={item.id} data-testid="debug-item">
                    {item.name} — {formatPrice(item.price)} —{' '}
                    <select
                      data-testid="debug-item-category"
                      value={item.category}
                      onChange={(e) => updateItemCategory(item, e.target.value)}
                    >
                      {CATEGORIES.map((category) => (
                        <option key={category.key} value={category.key}>
                          {category.label}
                        </option>
                      ))}
                    </select>{' '}
                    — essential: {String(resolveEssential(item))}{' '}
                    {item.essentialOverride !== null ? '(overridden)' : '(default)'}{' '}
                    <button type="button" data-testid="debug-item-essential-toggle" onClick={() => toggleEssentialOverride(item)}>
                      toggle override
                    </button>{' '}
                    <button type="button" onClick={() => removeItem(item)}>
                      remove
                    </button>
                  </li>
                ),
              )}
            </ul>
          </div>
        ))}
      </div>
    </details>
  )
}
