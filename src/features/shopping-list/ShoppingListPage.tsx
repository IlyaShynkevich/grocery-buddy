import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { usePendingReceipt } from '../receipt-review/usePendingReceipt'
import { formatDate } from '../../lib/formatDate'
import { cardStyle, mutedTextStyle, pageStyle, primaryButtonStyle } from '../../lib/ui'
import { useShoppingList } from './useShoppingList'

export function ShoppingListPage() {
  const { trip, items, addItem, renameItem, removeItem, saveTrip } = useShoppingList()
  const [draftName, setDraftName] = useState('')

  // While a receipt review is pending, the review panel and Save trip
  // button need to both be visible without scrolling past the full item
  // list — so the list (not the header/date/Save trip button, which stay
  // put) collapses by default, same idea as the DB Debug Panel's
  // <details>. Any manual toggle is deliberately forgotten across a
  // pending-review transition in either direction, so the next receipt
  // always starts collapsed again rather than inheriting a stale choice.
  const pendingReceipt = usePendingReceipt()
  const hasPendingReview = !!pendingReceipt
  const [manualOpen, setManualOpen] = useState<boolean | null>(null)
  useEffect(() => {
    setManualOpen(null)
  }, [hasPendingReview])
  const isOpen = manualOpen ?? !hasPendingReview

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    await addItem(draftName)
    setDraftName('')
  }

  const listContent: ReactNode = (
    <>
      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '0.5rem', margin: '1rem 0' }}>
        <input
          type="text"
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          placeholder="Add an item…"
          aria-label="Item name"
          data-testid="add-item-input"
          style={{ flex: 1 }}
        />
        <button type="submit" data-testid="add-item-submit" style={primaryButtonStyle}>
          Add
        </button>
      </form>

      {items.length === 0 && <p style={mutedTextStyle}>No items yet — add what you're picking up.</p>}

      <ul
        style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}
        data-testid="shopping-list-items"
      >
        {items.map((item) => (
          <li
            key={item.id}
            data-testid="shopping-list-item"
            style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.5rem' }}
          >
            <input
              type="text"
              value={item.name}
              onChange={(e) => renameItem(item.id, e.target.value)}
              aria-label={`Edit ${item.name}`}
              style={{ flex: 1, background: 'transparent', border: '1px solid transparent' }}
            />
            <button
              type="button"
              onClick={() => removeItem(item.id)}
              aria-label={`Remove ${item.name}`}
              style={{ padding: '0.35rem 0.6rem', lineHeight: 1 }}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
    </>
  )

  return (
    <section data-testid="shopping-list" data-trip-id={trip?.id ?? ''} style={pageStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.75rem' }}>
        <h1 style={{ fontSize: '1.5rem' }}>Shopping List</h1>
        {trip && (
          <button
            type="button"
            data-testid="save-trip-button"
            onClick={saveTrip}
            style={{ background: 'transparent', color: 'var(--accent)', borderColor: 'var(--accent)' }}
          >
            Save trip
          </button>
        )}
      </div>
      <p style={{ ...mutedTextStyle, fontSize: '0.85rem', marginTop: '0.2rem' }}>
        {trip ? formatDate(trip.date) : 'Loading trip…'}
      </p>

      {hasPendingReview ? (
        <details
          data-testid="shopping-list-collapsible"
          open={isOpen}
          onToggle={(e) => setManualOpen(e.currentTarget.open)}
          style={{ marginTop: '0.5rem' }}
        >
          <summary data-testid="shopping-list-toggle" style={{ ...mutedTextStyle, fontSize: '0.85rem' }}>
            {isOpen ? 'Hide shopping list' : 'Show shopping list'}
          </summary>
          {listContent}
        </details>
      ) : (
        listContent
      )}
    </section>
  )
}
