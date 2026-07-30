import { formatPrice } from '../../lib/formatPrice'
import { useReceiptReview } from './useReceiptReview'

// Deliberately not a blocking modal/backdrop — the rest of the app (shopping
// list, another receipt capture) must stay usable while this is showing, and
// if the user never interacts with it at all the extracted items are still
// there (added up front in processReceipt), just unreviewed.
export function ReceiptReviewPanel() {
  const { receipt, addedItems, matches, resolveMatch, removeItem, updatePrice, finishReview } = useReceiptReview()

  if (!receipt) return null

  const title = matches.length > 0 ? 'Review your scan' : "Here's what we found"

  return (
    <section
      data-testid="receipt-review-panel"
      style={{
        maxWidth: 480,
        margin: '0.75rem auto',
        padding: '1rem',
        border: '2px solid #2e7d32',
        borderRadius: 8,
        textAlign: 'left',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 data-testid="receipt-review-title" style={{ fontSize: '1.1rem', margin: 0 }}>
          {title}
        </h2>
        <button
          type="button"
          data-testid="receipt-review-dismiss"
          aria-label="Dismiss review"
          onClick={finishReview}
          style={{ padding: '0.3rem 0.6rem' }}
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
              style={{ padding: '0.5rem 0', borderBottom: '1px solid #e0e0e0' }}
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

      <ul style={{ listStyle: 'none', padding: 0, margin: '0.75rem 0' }} data-testid="receipt-review-items">
        {addedItems.map((item) => (
          <li
            key={item.id}
            data-testid="receipt-review-item"
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0' }}
          >
            <span style={{ flex: 1 }}>{item.name}</span>
            <input
              type="number"
              step="0.01"
              value={item.price ?? ''}
              aria-label={`Price for ${item.name}`}
              onChange={(e) => updatePrice(item.id, Number(e.target.value))}
              style={{ width: '5rem', padding: '0.3rem' }}
            />
            <button
              type="button"
              data-testid="receipt-review-item-remove"
              aria-label={`Remove ${item.name}`}
              onClick={() => removeItem(item.id)}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>

      <button type="button" data-testid="receipt-review-confirm" onClick={finishReview} style={{ padding: '0.5rem 1rem' }}>
        Confirm
      </button>
    </section>
  )
}
