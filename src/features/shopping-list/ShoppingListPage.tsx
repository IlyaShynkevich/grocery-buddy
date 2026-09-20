import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useT } from '../../i18n'
import { usePendingReceipt } from '../receipt-review/usePendingReceipt'
import { formatDate } from '../../lib/formatDate'
import { captionStyle, footnoteStyle, listGroupStyle, listRowStyle, mutedTextStyle, pageStyle, primaryButtonStyle, space } from '../../lib/ui'
import { useShoppingList } from './useShoppingList'

export function ShoppingListPage() {
  const messages = useT()
  const { trip, items, unprocessedReceiptCount, addItem, renameItem, removeItem, toggleItemChecked, saveTrip } =
    useShoppingList()
  const [draftName, setDraftName] = useState('')
  const [saveError, setSaveError] = useState<string | null>(null)

  const handleSaveTrip = async () => {
    setSaveError(null)
    try {
      await saveTrip()
    } catch (err) {
      console.error('Grocery Buddy: saving the trip failed', err)
      setSaveError(err instanceof Error ? err.message : String(err))
    }
  }

  // The list is always collapsible via the toggle, in either direction, at
  // any time — tapping it expands when collapsed and collapses when
  // expanded, regardless of whether a review is pending. While a receipt
  // review is pending, the review panel and Save trip button need to both
  // be visible without scrolling past the full item list, so the list
  // additionally collapses by default the moment a *new* pending review
  // appears (the false -> true rising edge), same idea as the DB Debug
  // Panel's <details>. Once the review resolves (confirmed or dismissed),
  // the collapsed/open state is left exactly as it was — it does not force
  // back open — so a still-collapsed list stays collapsed until the user
  // expands it themselves via the toggle.
  const pendingReceipt = usePendingReceipt()
  const hasPendingReview = !!pendingReceipt
  const [isOpen, setIsOpen] = useState(true)
  const wasPendingReview = useRef(hasPendingReview)
  useEffect(() => {
    if (!wasPendingReview.current && hasPendingReview) setIsOpen(false)
    wasPendingReview.current = hasPendingReview
  }, [hasPendingReview])
  // Saving the trip starts a fresh empty draft — that new trip has no
  // history of its own, so it shouldn't inherit a collapsed state left
  // over from whatever the previous trip's review was doing.
  const tripId = trip?.id
  const lastTripId = useRef(tripId)
  useEffect(() => {
    if (lastTripId.current === tripId) return
    lastTripId.current = tripId
    setIsOpen(true)
  }, [tripId])

  // Same visible-hint treatment as the review gate (touch has no hover
  // tooltips). Removing the photo is named as the way out on purpose: it's
  // the only one in demo mode, where processing always fails.
  const hasUnprocessedReceipts = unprocessedReceiptCount > 0
  const unprocessedHint = messages.shopping.unprocessedHint(unprocessedReceiptCount)
  const saveBlockedReason = [
    hasUnprocessedReceipts ? messages.shopping.unprocessedTitle(unprocessedHint) : null,
    hasPendingReview ? messages.shopping.reviewTitle : null,
  ]
    .filter(Boolean)
    .join('. ') || undefined

  const [addError, setAddError] = useState<string | null>(null)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setAddError(null)
    try {
      await addItem(draftName)
      setDraftName('')
    } catch (err) {
      // The typed text stays in the box so nothing is lost.
      console.error('Grocery Buddy: adding an item failed', err)
      setAddError(err instanceof Error ? err.message : String(err))
    }
  }

  const listContent: ReactNode = (
    <>
      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: space.md, margin: `${space.lg} 0` }}>
        <input
          type="text"
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          placeholder={messages.shopping.addPlaceholder}
          aria-label={messages.shopping.itemNameLabel}
          data-testid="add-item-input"
          style={{ flex: 1 }}
        />
        <button type="submit" data-testid="add-item-submit" style={primaryButtonStyle}>
          {messages.common.add}
        </button>
      </form>

      {addError && (
        <p role="alert" data-testid="add-item-error" style={{ ...footnoteStyle, color: 'var(--danger)', margin: `-${space.xs} 0 ${space.lg}` }}>
          {messages.shopping.addFailed(addError)}
        </p>
      )}

      {items.length === 0 && <p style={mutedTextStyle}>{messages.shopping.empty}</p>}

      {/* One card, hairline-divided rows — same grouped-list treatment as
          History and Customize, so a list of things reads the same way
          everywhere in the app. */}
      <ul className="gb-group" style={listGroupStyle} data-testid="shopping-list-items">
        {items.map((item) => (
          <li
            key={item.id}
            data-testid="shopping-list-item"
            style={{ ...listRowStyle, gap: space.md, padding: `${space.xs} ${space.md}` }}
          >
            <input
              type="checkbox"
              checked={item.checked}
              onChange={(e) => toggleItemChecked(item.id, e.target.checked)}
              aria-label={item.checked ? messages.shopping.markNotGrabbed(item.name) : messages.shopping.markGrabbed(item.name)}
              data-testid="shopping-list-item-checkbox"
            />
            <input
              type="text"
              value={item.name}
              onChange={(e) => renameItem(item.id, e.target.value)}
              aria-label={messages.shopping.editItem(item.name)}
              style={{
                flex: 1,
                background: 'transparent',
                border: '1px solid transparent',
                ...(item.checked
                  ? { textDecoration: 'line-through', color: 'var(--text-muted)' }
                  : {}),
              }}
            />
            <button
              type="button"
              onClick={() => removeItem(item.id)}
              aria-label={messages.common.remove(item.name)}
              style={{ padding: `${space.sm} ${space.md}`, lineHeight: 1, background: 'transparent', border: 'none', color: 'var(--text-muted)' }}
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
      {/*
        Title on its own row; the trip's date and Save trip share the row
        below. Side by side with the title, a long Save trip label
        ("Сохранить покупку") plus its hints squeezed the title onto two
        lines — and whether the two fit on one row at all would depend on the
        phone's font. This layout doesn't: neither element ever competes
        with the title for width, in any language.
      */}
      <h1>{messages.shopping.title}</h1>
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space.lg, marginTop: space.xs }}
      >
        <p data-testid="shopping-trip-date" style={{ ...footnoteStyle, ...mutedTextStyle }}>
          {trip ? formatDate(trip.date) : messages.shopping.loadingTrip}
        </p>
        {trip && (
          <button
            type="button"
            data-testid="save-trip-button"
            onClick={handleSaveTrip}
            disabled={hasPendingReview || hasUnprocessedReceipts}
            title={saveBlockedReason}
            style={{ background: 'transparent', color: 'var(--accent)', borderColor: 'var(--accent)', flexShrink: 0, whiteSpace: 'nowrap' }}
          >
            {messages.shopping.saveTrip}
          </button>
        )}
      </div>
      {trip && (hasUnprocessedReceipts || hasPendingReview) && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: space['2xs'], marginTop: space.xs }}>
          {hasUnprocessedReceipts && (
            <span data-testid="save-trip-unprocessed-hint" style={{ ...captionStyle, ...mutedTextStyle, textAlign: 'right' }}>
              {unprocessedHint}
            </span>
          )}
          {hasPendingReview && (
            <span data-testid="save-trip-disabled-hint" style={{ ...captionStyle, ...mutedTextStyle, textAlign: 'right' }}>
              {messages.shopping.reviewHint}
            </span>
          )}
        </div>
      )}
      {saveError && (
        <p role="alert" data-testid="save-trip-error" style={{ ...footnoteStyle, color: 'var(--danger)', marginTop: space.sm }}>
          {messages.shopping.saveFailed(saveError)}
        </p>
      )}

      <details
        data-testid="shopping-list-collapsible"
        open={isOpen}
        onToggle={(e) => setIsOpen(e.currentTarget.open)}
        style={{ marginTop: space.md }}
      >
        <summary data-testid="shopping-list-toggle" style={{ ...footnoteStyle, ...mutedTextStyle }}>
          {isOpen ? messages.shopping.hideList : messages.shopping.showList}
        </summary>
        {listContent}
      </details>
    </section>
  )
}
