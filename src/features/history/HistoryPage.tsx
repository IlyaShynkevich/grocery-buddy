import { useState } from 'react'
import { useT } from '../../i18n'
import { formatDate } from '../../lib/formatDate'
import { formatPrice } from '../../lib/formatPrice'
import { calloutStyle, footnoteStyle, listGroupStyle, listRowStyle, mutedTextStyle, numericStyle, pageStyle, space } from '../../lib/ui'
import { Mascot } from '../mascot/Mascot'
import { groupTripsByMonth, useHistory } from './useHistory'

export function HistoryPage({ onSelectTrip }: { onSelectTrip: (tripId: number) => void }) {
  const messages = useT()
  const trips = useHistory()
  const groups = groupTripsByMonth(trips)
  const [monthFilter, setMonthFilter] = useState('')

  const visibleGroups = monthFilter ? groups.filter((group) => group.key === monthFilter) : groups

  return (
    <section data-testid="history-page" style={pageStyle}>
      {/* The month filter shares the title row (its label kept for screen
          readers): on its own row it pushed the page past one phone screen. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: space.md }}>
        <h1 style={{ marginRight: 'auto' }}>{messages.history.title}</h1>
        {groups.length > 1 && (
          <select
            data-testid="history-month-select"
            aria-label={messages.history.filterByMonth}
            title={messages.history.filterByMonth}
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            style={{ minHeight: '2.5rem', minWidth: 0 }}
          >
            <option value="">{messages.history.allMonths}</option>
            {groups.map((group) => (
              <option key={group.key} value={group.key}>
                {group.label}
              </option>
            ))}
          </select>
        )}
        <Mascot pose="receiptfound" size={32} />
      </div>

      {trips.length === 0 && <p style={{ ...mutedTextStyle, marginTop: space.lg }}>{messages.history.empty}</p>}

      {/*
        Fixed max-height, not an unbounded page: without this, a long
        history pushes Debug tools/the footer down and off-screen, requiring
        the whole page to scroll. 35.5rem (568px at the default root font
        size) is the page's whole remaining height budget — measured live
        against a real `npm run preview` build at 393x777, in both
        languages, not guessed.

        What fits in it, with the current grouped-list row metrics
        (re-measured live for the design pass, since a month's trips are now
        hairline-divided rows of one card rather than separate cards with an
        8px gap between them — a guess here previously shorted the container
        by a full row):

          row height                45px
          hairline between rows      1px   -> 46px per row after the first
          month header              22.1px + 6px margin-bottom
          group wrapper margin-top  16px
          fixed overhead per month  = 16 + 22.1 + 6 = 44.1px

        One month, 11 rows: 44.1 + 45 + 10*46 = 549.1px, inside 568. A 12th
        row would need 595.1px, so 11 is the boundary — e2e's
        history-improvements.spec.ts asserts exactly that (11 fits, 12
        scrolls). It was 10 while rows were separate cards, and 7 before
        Backup & restore moved off this page to Settings.

        max-height (not height) so fewer trips, or a month-filtered view
        with few trips, still render at their natural height with no forced
        scrollbar/dead space; only content taller than that clips and
        scrolls internally. The heading, "No saved trips yet" message, and
        month filter above stay outside this container so they're always
        visible without scrolling.
      */}
      <div data-testid="history-list-scroll" style={{ maxHeight: '35.5rem', overflowY: 'auto' }}>
        {visibleGroups.map((group) => (
          <div key={group.key} data-testid="history-month-group" data-month-key={group.key} style={{ marginTop: space.xl }}>
            {/*
              position: sticky (not static) — the standard "swapping section
              header" pattern (contact lists, calendars): each month's header
              sticks to the top of the scrollable container for as long as
              any of that month's rows are in view, then is pushed off by
              the next month's header once its own group has fully scrolled
              past, which is what makes the pinned label "swap" to the new
              month automatically. No JS scroll tracking needed — this falls
              out of every group having its own sticky header stacked in
              normal document order. background matches the page (not
              --surface, which is the row cards' color) so scrolled-past rows
              don't show through underneath the pinned label; zIndex keeps it
              above those rows too, since sticky doesn't imply a paint order.
            */}
            <h2
              data-testid="history-month-header"
              style={{ margin: `0 0 ${space.sm}`, position: 'sticky', top: 0, background: 'var(--bg)', zIndex: 1 }}
            >
              {group.label}
            </h2>
            {/* One card per month, rows divided by hairlines — not a card
                per trip with gaps between them. Same information, far less
                edge-drawing, and it gives the month back the ~8px of gap
                each row used to cost. */}
            <ul className="gb-group" style={listGroupStyle} data-testid="history-list">
              {group.trips.map((trip) => (
                <li key={trip.id}>
                  <button
                    type="button"
                    data-testid="history-trip"
                    data-trip-id={trip.id}
                    onClick={() => onSelectTrip(trip.id)}
                    style={{ ...listRowStyle, ...calloutStyle, justifyContent: 'space-between', background: 'transparent', border: 'none', borderRadius: 0 }}
                  >
                    <span>
                      {formatDate(trip.date)}
                      {trip.store ? ` — ${trip.store}` : ''}
                    </span>
                    <span style={{ ...footnoteStyle, ...mutedTextStyle, ...numericStyle, whiteSpace: 'nowrap' }}>
                      {messages.history.tripSummary(trip.itemCount, formatPrice(trip.total, trip.currency))}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}
