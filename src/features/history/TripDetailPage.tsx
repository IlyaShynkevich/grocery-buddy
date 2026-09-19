import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState } from 'react'
import { resolveEssential } from '../../db/categories'
import { db, deleteTrip, recomputeTripTotal, type Item } from '../../db/db'
import { useT } from '../../i18n'
import { formatDate } from '../../lib/formatDate'
import { formatPrice } from '../../lib/formatPrice'
import { cardStyle, dangerButtonStyle, dangerFilledButtonStyle, mutedTextStyle, pageStyle } from '../../lib/ui'

// How long a press has to hold before it counts as "long press" instead of
// a tap — long enough that a normal tap/click never crosses it, short
// enough it doesn't feel unresponsive.
const LONG_PRESS_MS = 500

// Otherwise read-only by construction: no inputs, no per-item remove
// buttons, nothing that mutates db.items — a completed trip is done, this
// is just for looking back at what was bought. The intentional, scoped
// exceptions are toggling an item's essential/non-essential badge (a
// personal classification, not a record of what happened — Stats picks up
// the change live since it queries db.items directly rather than trusting a
// snapshot) and deleting one or more items (a cleanup tool for leftover
// unmatched items, e.g. a typed "milk" the AI's fuzzy match couldn't pair
// with the receipt's German "Milch" — see itemMatch.ts's known
// translation-gap limitation). Deleting the whole trip is the third
// mutation, gated behind its own explicit confirmation step since it's
// destructive and irreversible.
export function TripDetailPage({ tripId, onBack }: { tripId: number; onBack: () => void }) {
  const messages = useT()
  const trip = useLiveQuery(() => db.trips.get(tripId), [tripId])
  const items = useLiveQuery(() => db.items.where('tripId').equals(tripId).sortBy('id'), [tripId], [])
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  // Single-item delete (tap an item -> inline confirm on that row).
  const [pendingDeleteItemId, setPendingDeleteItemId] = useState<number | null>(null)

  // Multi-select (long-press an item -> that item is selected, tap more to
  // add/remove, then one bulk confirm). `null` means not in multi-select
  // mode at all — distinct from an empty Set, which would mean "in
  // multi-select mode with nothing currently selected" (reachable by
  // tapping the sole selected item back off).
  const [selectedIds, setSelectedIds] = useState<Set<number> | null>(null)
  const [confirmingBulkDelete, setConfirmingBulkDelete] = useState(false)
  const multiSelectActive = selectedIds !== null

  // Tap vs. long-press is decided entirely from pointer events (down/up/
  // leave/cancel) rather than the browser's own `click` — a `click` isn't
  // guaranteed to follow a long pointerdown+up (observed missing entirely
  // in Playwright's synthetic mouse events for a >500ms hold), so relying
  // on it to distinguish "the tap right after a long-press fired" from "an
  // unrelated later tap" was unreliable. `pressItemId` is which item (if
  // any) currently has an in-flight press; `firedLongPress` marks that
  // press as already resolved by the long-press timer, so the matching
  // pointerup does nothing further instead of also registering as a tap.
  const longPressTimer = useRef<number | null>(null)
  const pressItemId = useRef<number | null>(null)
  const firedLongPress = useRef(false)

  const clearLongPressTimer = () => {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  const resetPress = () => {
    clearLongPressTimer()
    pressItemId.current = null
    firedLongPress.current = false
  }

  const handleItemPointerDown = (itemId: number) => {
    clearLongPressTimer()
    pressItemId.current = itemId
    firedLongPress.current = false
    longPressTimer.current = window.setTimeout(() => {
      firedLongPress.current = true
      setSelectedIds((current) => new Set(current).add(itemId))
      setPendingDeleteItemId(null)
    }, LONG_PRESS_MS)
  }

  const handleItemPointerUp = (itemId: number) => {
    clearLongPressTimer()
    const wasPressingThisItem = pressItemId.current === itemId
    const alreadyHandledAsLongPress = firedLongPress.current
    pressItemId.current = null
    firedLongPress.current = false
    if (!wasPressingThisItem || alreadyHandledAsLongPress) return

    if (multiSelectActive) {
      setSelectedIds((current) => {
        const next = new Set(current)
        if (next.has(itemId)) next.delete(itemId)
        else next.add(itemId)
        return next
      })
    } else {
      setPendingDeleteItemId(itemId)
    }
  }

  const exitMultiSelect = () => {
    setSelectedIds(null)
    setConfirmingBulkDelete(false)
  }

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

  const deleteSingleItem = async (item: Item) => {
    await db.transaction('rw', db.items, db.trips, async () => {
      await db.items.delete(item.id)
      await recomputeTripTotal(tripId)
    })
    setPendingDeleteItemId(null)
  }

  const deleteSelectedItems = async () => {
    if (!selectedIds || selectedIds.size === 0) return
    await db.transaction('rw', db.items, db.trips, async () => {
      await db.items.bulkDelete([...selectedIds])
      await recomputeTripTotal(tripId)
    })
    exitMultiSelect()
  }

  return (
    <section data-testid="trip-detail-page" style={pageStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
        <button type="button" data-testid="trip-detail-back" onClick={onBack}>
          {messages.tripDetail.back}
        </button>
        {!confirmingDelete && (
          <button type="button" data-testid="trip-detail-delete" onClick={() => setConfirmingDelete(true)} style={dangerButtonStyle}>
            {messages.tripDetail.deleteTrip}
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
          <p style={{ marginBottom: '0.6rem' }}>{messages.tripDetail.confirmDeleteTrip}</p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="button" data-testid="trip-detail-delete-yes" onClick={handleDelete} style={dangerFilledButtonStyle}>
              {messages.common.yesDelete}
            </button>
            <button type="button" data-testid="trip-detail-delete-cancel" onClick={() => setConfirmingDelete(false)}>
              {messages.common.cancel}
            </button>
          </div>
        </div>
      )}

      <h1 style={{ fontSize: '1.5rem', marginTop: '0.75rem' }}>{trip ? formatDate(trip.date) : messages.tripDetail.loading}</h1>
      {trip?.store && <p style={{ ...mutedTextStyle, marginTop: '0.2rem' }}>{trip.store}</p>}
      <p data-testid="trip-detail-total" style={{ fontWeight: 700, marginTop: '0.4rem' }}>
        {messages.common.total(trip ? formatPrice(trip.total, trip.currency) : formatPrice(null))}
      </p>

      {multiSelectActive && !confirmingBulkDelete && (
        <div
          data-testid="trip-detail-multiselect-bar"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '0.5rem',
            margin: '0.75rem 0',
            padding: '0.5rem 0.75rem',
            background: 'var(--surface)',
            border: '1px solid var(--border-strong)',
            borderRadius: 'var(--radius)',
          }}
        >
          <span data-testid="trip-detail-multiselect-count">
            {messages.tripDetail.selected(selectedIds!.size)}
          </span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {selectedIds!.size > 0 && (
              <button
                type="button"
                data-testid="trip-detail-multiselect-delete"
                onClick={() => setConfirmingBulkDelete(true)}
                style={dangerButtonStyle}
              >
                {messages.tripDetail.delete}
              </button>
            )}
            <button type="button" data-testid="trip-detail-multiselect-cancel" onClick={exitMultiSelect}>
              {messages.common.cancel}
            </button>
          </div>
        </div>
      )}

      {confirmingBulkDelete && (
        <div
          data-testid="trip-detail-bulk-delete-confirm"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--danger)',
            borderRadius: 'var(--radius)',
            padding: '0.75rem',
            margin: '0.75rem 0',
          }}
        >
          <p style={{ marginBottom: '0.6rem' }}>
            {messages.tripDetail.confirmBulkDelete(selectedIds!.size)}
          </p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="button" data-testid="trip-detail-bulk-delete-yes" onClick={deleteSelectedItems} style={dangerFilledButtonStyle}>
              {messages.common.yesDelete}
            </button>
            <button type="button" data-testid="trip-detail-bulk-delete-cancel" onClick={() => setConfirmingBulkDelete(false)}>
              {messages.common.cancel}
            </button>
          </div>
        </div>
      )}

      <ul
        style={{ listStyle: 'none', padding: 0, margin: '1rem 0 0', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}
        data-testid="trip-detail-items"
      >
        {regularItems.map((item) => {
          const essential = resolveEssential(item)
          const isSelected = selectedIds?.has(item.id) ?? false
          const isPendingSingleDelete = pendingDeleteItemId === item.id

          return (
            <li
              key={item.id}
              data-testid="trip-detail-item"
              data-selected={isSelected}
              onPointerDown={() => handleItemPointerDown(item.id)}
              onPointerUp={() => handleItemPointerUp(item.id)}
              onPointerLeave={resetPress}
              onPointerCancel={resetPress}
              style={{
                ...cardStyle,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                cursor: 'pointer',
                userSelect: 'none',
                // `border` (not the longhand `borderColor`) so this and
                // cardStyle's own `border: '1px solid var(--border)'` are
                // the same style key — React can then just revert it
                // cleanly on deselect. Mixing a shorthand with a longhand
                // override here previously left a stale border-color once
                // the longhand key was removed: clearing an inline
                // `borderColor` doesn't restore the color the `border`
                // shorthand had set, it falls back to the CSS-initial
                // `currentColor` — which reads as a stray white/light
                // outline in dark mode (`--text` there is near-white).
                ...(isSelected ? { border: '1px solid var(--accent)', background: 'var(--surface-hover)' } : {}),
              }}
            >
              {isPendingSingleDelete ? (
                <div
                  data-testid="trip-detail-item-delete-confirm"
                  style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%' }}
                >
                  <span>{messages.tripDetail.confirmItemDelete(item.name)}</span>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      type="button"
                      data-testid="trip-detail-item-delete-yes"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteSingleItem(item)
                      }}
                      style={dangerFilledButtonStyle}
                    >
                      {messages.common.yesDelete}
                    </button>
                    <button
                      type="button"
                      data-testid="trip-detail-item-delete-cancel"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation()
                        setPendingDeleteItemId(null)
                      }}
                    >
                      {messages.common.cancel}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <span>{item.name}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    {multiSelectActive ? (
                      <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                        {essential ? messages.common.essential : messages.common.nonEssential}
                      </span>
                    ) : (
                      <button
                        type="button"
                        data-testid="trip-detail-item-essential"
                        data-essential={essential}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleEssential(item)
                        }}
                        aria-label={messages.tripDetail.markAs(item.name, essential)}
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
                        {essential ? messages.common.essential : messages.common.nonEssential}
                      </button>
                    )}
                    <span>{formatPrice(item.price, trip?.currency)}</span>
                  </span>
                </>
              )}
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
              <span>{formatPrice(item.price, trip?.currency)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
