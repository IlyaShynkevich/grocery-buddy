import type { ChangeEvent } from 'react'
import { useState } from 'react'
import { resolveEssential } from '../../db/categories'
import type { Item } from '../../db/db'
import { categoryLabel, useT } from '../../i18n'
import { formatDate } from '../../lib/formatDate'
import { formatPrice } from '../../lib/formatPrice'
import { calloutStyle, captionStyle, footnoteStyle, headingStyle, iconButtonStyle, mutedTextStyle, numericStyle, PAGE_MAX_WIDTH, primaryButtonStyle, space } from '../../lib/ui'
import { useReceiptReview } from './useReceiptReview'

/**
 * Owns its own text so typing doesn't fight Dexie's round-trip: the write
 * this input itself triggers re-renders the parent's live query with a new
 * `item` object, but we only want to seed local state from `item.price`
 * once per row (on mount), not resync on every keystroke — a controlled
 * value driven straight off item.price would reset the cursor/selection on
 * every character typed.
 */
function PriceInput({
  item,
  onChange,
}: {
  item: Omit<Item, 'id'>
  onChange: (event: ChangeEvent<HTMLInputElement>) => void
}) {
  const messages = useT()
  const [value, setValue] = useState(item.price !== null ? String(item.price) : '')
  return (
    <input
      type="number"
      step="0.01"
      value={value}
      data-testid="receipt-review-item-price"
      aria-label={messages.review.priceFor(item.name)}
      onChange={(e) => {
        setValue(e.target.value)
        onChange(e)
      }}
      style={{ width: '5rem' }}
    />
  )
}

/** Same seed-once local state as PriceInput, for the same reason: a partially-typed date reads as '' and must not snap back to the stored value mid-edit. */
function DateInput({ initialDate, onChange }: { initialDate: string; onChange: (date: string) => void }) {
  const messages = useT()
  const [value, setValue] = useState(initialDate)
  return (
    <input
      type="date"
      value={value}
      data-testid="receipt-review-date-input"
      aria-label={messages.review.purchaseDate}
      onChange={(e) => {
        setValue(e.target.value)
        onChange(e.target.value)
      }}
    />
  )
}

// Deliberately not a blocking modal/backdrop — the rest of the app (shopping
// list, another receipt capture) must stay usable while this is showing, and
// if the user never interacts with it at all nothing has touched the
// shopping list yet either — extracted items are staged on the receipt
// itself (see useReceiptReview) until Confirm.
export function ReceiptReviewPanel() {
  const messages = useT()
  const {
    receipt,
    tripDate,
    tripCurrency,
    addedItems,
    matches,
    resolveMatch,
    removeItem,
    updatePrice,
    updateDate,
    confirmReview,
    dismissReview,
  } = useReceiptReview()
  const [dateSaveError, setDateSaveError] = useState<string | null>(null)
  // Collapsed by default so the panel doesn't push the shopping list (and
  // Save trip) out of view the moment processing finishes — same idea as
  // ShoppingListPage's own collapsible list, reusing the <details>/<summary>
  // show/hide pattern. Expanding/collapsing never touches the staged items,
  // so edits survive either way.
  const [isOpen, setIsOpen] = useState(false)

  if (!receipt) return null

  const title = matches.length > 0 ? messages.review.titleMatches : messages.review.titleFound
  // Derived straight from the staged items held on the receipt (see
  // useReceiptReview), so an edited price flows through Dexie ->
  // useLiveQuery -> this sum automatically — no separate "edited total"
  // state to keep in sync, and it's still the AI's total until Confirm
  // actually writes anything.
  const total = addedItems.reduce((sum, { item }) => sum + (item.price ?? 0), 0)

  const handlePriceChange = (stagedIndex: number, itemName: string, event: ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value
    // Mid-edit (e.g. the field briefly empty while retyping) isn't an
    // invalid price yet — nothing to write, nothing to report.
    if (raw.trim() === '') return

    const price = event.target.valueAsNumber
    if (Number.isNaN(price)) {
      console.error(`Ignored invalid price edit for "${itemName}": ${JSON.stringify(raw)}`)
      return
    }

    updatePrice(stagedIndex, price).catch((error: unknown) => {
      console.error(`Failed to save price for "${itemName}"`, error)
    })
  }

  // The AI's (or user's) staged date when there is one; otherwise the trip's
  // own date, shown as-is — that's also exactly what Confirm leaves in place.
  const shownDate = receipt.stagedDate ?? tripDate
  // What the AI read as the date but couldn't be parsed (legacy rows carry a
  // full English sentence instead — see PendingReceipt.stagedDateError).
  const unreadableDate = receipt.stagedDateRaw ?? receipt.stagedDateError

  const handleDateChange = (date: string) => {
    // Mid-edit (a date input reports '' until every part is filled in) —
    // nothing to write yet, same as an emptied price field.
    if (date === '') return
    setDateSaveError(null)
    updateDate(date).catch((error: unknown) => {
      console.error('Failed to save purchase date', error)
      setDateSaveError(error instanceof Error ? error.message : String(error))
    })
  }

  const confirmButton = (
    <button type="button" data-testid="receipt-review-confirm" onClick={confirmReview} style={primaryButtonStyle}>
      {messages.review.confirm}
    </button>
  )

  return (
    <section
      data-testid="receipt-review-panel"
      style={{
        width: '100%',
        maxWidth: PAGE_MAX_WIDTH,
        margin: `${space.lg} auto`,
        padding: space.xl,
        background: 'var(--surface)',
        // A stronger ring than an ordinary card's: this panel is asking for
        // a decision, so it should read as raised above the page.
        boxShadow: '0 0 0 1px var(--border-strong)',
        borderRadius: 'var(--radius-lg)',
        textAlign: 'left',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 data-testid="receipt-review-title">{title}</h2>
        <button
          type="button"
          data-testid="receipt-review-dismiss"
          aria-label={messages.review.dismiss}
          onClick={dismissReview}
          style={{ ...iconButtonStyle, background: 'transparent', border: 'none', color: 'var(--text-muted)' }}
        >
          ✕
        </button>
      </div>

      {matches.length > 0 && (
        <ul className="gb-group" style={{ listStyle: 'none', padding: 0, margin: `${space.lg} 0` }}>
          {matches.map((match) => (
            <li
              key={match.typedItemId}
              data-testid="receipt-review-match"
              style={{ padding: `${space.lg} 0` }}
            >
              <div>
                {messages.review.matchQuestion(
                  <strong>{match.typedItem.name}</strong>,
                  <strong>{match.stagedItem.name}</strong>,
                  formatPrice(match.stagedItem.price, tripCurrency),
                )}
              </div>
              <div style={{ display: 'flex', gap: space.md, marginTop: space.md }}>
                <button
                  type="button"
                  data-testid="receipt-review-match-yes"
                  onClick={() => resolveMatch(match.typedItemId, 'merge')}
                  style={primaryButtonStyle}
                >
                  {messages.review.yesSame}
                </button>
                <button
                  type="button"
                  data-testid="receipt-review-match-no"
                  onClick={() => resolveMatch(match.typedItemId, 'separate')}
                >
                  {messages.review.noKeepBoth}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div
        data-testid="receipt-review-summary"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: space.lg, margin: `${space.lg} 0` }}
      >
        <span style={{ display: 'flex', flexDirection: 'column' }}>
          <span data-testid="receipt-review-total" style={{ ...headingStyle, ...numericStyle, fontWeight: 700 }}>
            {messages.common.total(formatPrice(total, tripCurrency))}
          </span>
          {shownDate && (
            <span data-testid="receipt-review-date" style={{ ...footnoteStyle, ...mutedTextStyle }}>
              {messages.review.date(formatDate(shownDate))}
            </span>
          )}
        </span>
        {!isOpen && confirmButton}
      </div>

      {unreadableDate && (
        <p role="alert" data-testid="receipt-review-date-error" style={{ ...footnoteStyle, color: 'var(--danger)', margin: `0 0 ${space.lg}` }}>
          {messages.review.dateUnreadable(unreadableDate)}
        </p>
      )}
      {dateSaveError && (
        <p role="alert" data-testid="receipt-review-date-save-error" style={{ ...footnoteStyle, color: 'var(--danger)', margin: `0 0 ${space.lg}` }}>
          {messages.review.dateSaveFailed(dateSaveError)}
        </p>
      )}

      <details
        data-testid="receipt-review-collapsible"
        open={isOpen}
        onToggle={(e) => setIsOpen(e.currentTarget.open)}
      >
        <summary data-testid="receipt-review-toggle" style={{ ...footnoteStyle, ...mutedTextStyle }}>
          {isOpen ? messages.review.hideItems : messages.review.showItems}
        </summary>

        {shownDate && (
          <label
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space.md, marginTop: space.lg }}
          >
            {messages.review.purchaseDate}
            {/* keyed by receipt so the next queued receipt's review re-seeds it */}
            <DateInput key={receipt.id} initialDate={shownDate} onChange={handleDateChange} />
          </label>
        )}

        <ul className="gb-group" style={{ listStyle: 'none', padding: 0, margin: `${space.lg} 0` }} data-testid="receipt-review-items">
          {addedItems.map(({ stagedIndex, item }) => {
            const essential = resolveEssential(item)
            return (
              <li
                key={stagedIndex}
                data-testid="receipt-review-item"
                style={{ ...calloutStyle, display: 'flex', alignItems: 'center', gap: space.md, padding: `${space.md} 0` }}
              >
                <span style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <span>{item.name}</span>
                  <span style={{ ...captionStyle, ...mutedTextStyle }}>
                    {categoryLabel(messages, item.category)} ·{' '}
                    {essential ? messages.common.essential : messages.common.nonEssential}
                  </span>
                </span>
                <PriceInput item={item} onChange={(e) => handlePriceChange(stagedIndex, item.name, e)} />
                <button
                  type="button"
                  data-testid="receipt-review-item-remove"
                  aria-label={messages.common.remove(item.name)}
                  onClick={() => removeItem(stagedIndex)}
                  style={{ ...iconButtonStyle, background: 'transparent', border: 'none', color: 'var(--text-muted)' }}
                >
                  ✕
                </button>
              </li>
            )
          })}
        </ul>

        {isOpen && <div style={{ marginTop: space.md }}>{confirmButton}</div>}
      </details>
    </section>
  )
}
