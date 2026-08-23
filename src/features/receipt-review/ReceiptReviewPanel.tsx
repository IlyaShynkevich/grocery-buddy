import type { ChangeEvent } from 'react'
import { useState } from 'react'
import { getCategory, resolveEssential } from '../../db/categories'
import type { Item } from '../../db/db'
import { formatPrice } from '../../lib/formatPrice'
import { mutedTextStyle, PAGE_MAX_WIDTH, primaryButtonStyle } from '../../lib/ui'
import { useReceiptReview } from './useReceiptReview'

/**
 * Owns its own text so typing doesn't fight Dexie's round-trip: the write
 * this input itself triggers re-renders the parent's live query with a new
 * `item` object, but we only want to seed local state from `item.price`
 * once per row (on mount), not resync on every keystroke — a controlled
 * value driven straight off item.price would reset the cursor/selection on
 * every character typed.
 */
function PriceInput({ item, onChange }: { item: Item; onChange: (item: Item, event: ChangeEvent<HTMLInputElement>) => void }) {
  const [value, setValue] = useState(item.price !== null ? String(item.price) : '')
  return (
    <input
      type="number"
      step="0.01"
      value={value}
      data-testid="receipt-review-item-price"
      aria-label={`Price for ${item.name}`}
      onChange={(e) => {
        setValue(e.target.value)
        onChange(item, e)
      }}
      style={{ width: '5rem' }}
    />
  )
}

// Deliberately not a blocking modal/backdrop — the rest of the app (shopping
// list, another receipt capture) must stay usable while this is showing, and
// if the user never interacts with it at all the extracted items are still
// there (added up front in processReceipt), just unreviewed.
export function ReceiptReviewPanel() {
  const { receipt, addedItems, matches, resolveMatch, removeItem, updatePrice, finishReview } = useReceiptReview()
  // Collapsed by default so the panel doesn't push the shopping list (and
  // Save trip) out of view the moment processing finishes — same idea as
  // ShoppingListPage's own collapsible list, reusing the <details>/<summary>
  // show/hide pattern. Expanding/collapsing never touches the underlying
  // items (which live in Dexie via addedItems), so edits survive either way.
  const [isOpen, setIsOpen] = useState(false)

  if (!receipt) return null

  const title = matches.length > 0 ? 'Review your scan' : "Here's what we found"
  // Derived straight from the live-queried addedItems (see useReceiptReview),
  // so an edited price flows through Dexie -> useLiveQuery -> this sum
  // automatically — no separate "edited total" state to keep in sync.
  const total = addedItems.reduce((sum, item) => sum + (item.price ?? 0), 0)

  const handlePriceChange = (item: Item, event: ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value
    // Mid-edit (e.g. the field briefly empty while retyping) isn't an
    // invalid price yet — nothing to write, nothing to report.
    if (raw.trim() === '') return

    const price = event.target.valueAsNumber
    if (Number.isNaN(price)) {
      console.error(`Ignored invalid price edit for "${item.name}": ${JSON.stringify(raw)}`)
      return
    }

    updatePrice(item.id, price).catch((error: unknown) => {
      console.error(`Failed to save price for "${item.name}"`, error)
    })
  }

  const confirmButton = (
    <button type="button" data-testid="receipt-review-confirm" onClick={finishReview} style={primaryButtonStyle}>
      Confirm
    </button>
  )

  return (
    <section
      data-testid="receipt-review-panel"
      style={{
        width: '100%',
        maxWidth: PAGE_MAX_WIDTH,
        margin: '0.75rem auto',
        padding: '1rem',
        background: 'var(--surface)',
        border: '1px solid var(--border-strong)',
        borderRadius: 'var(--radius)',
        textAlign: 'left',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 data-testid="receipt-review-title" style={{ fontSize: '1.1rem' }}>
          {title}
        </h2>
        <button
          type="button"
          data-testid="receipt-review-dismiss"
          aria-label="Dismiss review"
          onClick={finishReview}
          style={{ padding: '0.35rem 0.6rem', lineHeight: 1 }}
        >
          ✕
        </button>
      </div>

      {matches.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: '0.75rem 0' }}>
          {matches.map((match) => (
            <li
              key={match.typedItemId}
              data-testid="receipt-review-match"
              style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--border)' }}
            >
              <div>
                Is <strong>{match.typedItem.name}</strong> the same as{' '}
                <strong>{match.extractedItem.name}</strong> ({formatPrice(match.extractedItem.price)})?
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.4rem' }}>
                <button
                  type="button"
                  data-testid="receipt-review-match-yes"
                  onClick={() => resolveMatch(match.typedItemId, 'merge')}
                  style={primaryButtonStyle}
                >
                  Yes, same item
                </button>
                <button
                  type="button"
                  data-testid="receipt-review-match-no"
                  onClick={() => resolveMatch(match.typedItemId, 'separate')}
                >
                  No, keep both
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div
        data-testid="receipt-review-summary"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', margin: '0.75rem 0' }}
      >
        <span data-testid="receipt-review-total" style={{ fontWeight: 700 }}>
          Total: {formatPrice(total)}
        </span>
        {!isOpen && confirmButton}
      </div>

      <details
        data-testid="receipt-review-collapsible"
        open={isOpen}
        onToggle={(e) => setIsOpen(e.currentTarget.open)}
      >
        <summary data-testid="receipt-review-toggle" style={{ ...mutedTextStyle, fontSize: '0.85rem' }}>
          {isOpen ? 'Hide items ▾' : 'Show items ▸'}
        </summary>

        <ul style={{ listStyle: 'none', padding: 0, margin: '0.75rem 0' }} data-testid="receipt-review-items">
          {addedItems.map((item) => {
            const essential = resolveEssential(item)
            return (
              <li
                key={item.id}
                data-testid="receipt-review-item"
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0', borderBottom: '1px solid var(--border)' }}
              >
                <span style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <span>{item.name}</span>
                  <span style={{ ...mutedTextStyle, fontSize: '0.75rem' }}>
                    {getCategory(item.category).label} · {essential ? 'essential' : 'non-essential'}
                  </span>
                </span>
                <PriceInput item={item} onChange={handlePriceChange} />
                <button
                  type="button"
                  data-testid="receipt-review-item-remove"
                  aria-label={`Remove ${item.name}`}
                  onClick={() => removeItem(item.id)}
                  style={{ padding: '0.35rem 0.6rem', lineHeight: 1 }}
                >
                  ✕
                </button>
              </li>
            )
          })}
        </ul>

        {isOpen && <div style={{ marginTop: '0.5rem' }}>{confirmButton}</div>}
      </details>
    </section>
  )
}
