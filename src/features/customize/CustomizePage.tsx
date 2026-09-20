import { useState, type FormEvent } from 'react'
import { CATEGORIES, type Category } from '../../db/categories'
import { categoryLabel, useT } from '../../i18n'
import { footnoteStyle, iconButtonStyle, listGroupStyle, listRowStyle, mutedTextStyle, pageStyle, primaryButtonStyle, space } from '../../lib/ui'
import { Mascot } from '../mascot/Mascot'
import { useCategoryNotes } from './useCategoryNotes'

/**
 * One category's notes: the list of what the user's already written (each
 * removable), an empty state when there's nothing yet, and the add-a-note
 * form. Lives inside the category's own <details> below, so it's only ever
 * rendered while that category happens to be expanded — but per the same
 * native <details> behavior DbDebugPanel/ShoppingListPage already rely on,
 * it stays mounted (and its live query stays reactive) even while collapsed,
 * just not painted.
 */
function CategoryNotes({ category }: { category: Category }) {
  const messages = useT()
  const { notes, addNote, removeNote } = useCategoryNotes(category.key)
  const [draftText, setDraftText] = useState('')

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    await addNote(draftText)
    setDraftText('')
  }

  return (
    <div style={{ padding: `${space.lg} 0 ${space['2xs']}` }}>
      {notes.length === 0 ? (
        <p data-testid="category-notes-empty" style={mutedTextStyle}>
          {messages.customize.notesEmpty}
        </p>
      ) : (
        <ul
          data-testid="category-notes-list"
          className="gb-group"
          style={{ ...listGroupStyle, background: 'var(--bg)', boxShadow: 'none', margin: `0 0 ${space.lg}` }}
        >
          {notes.map((note) => (
            <li
              key={note.id}
              data-testid="category-note"
              style={{ ...listRowStyle, padding: `${space.md} 0` }}
            >
              <span style={{ flex: 1 }}>{note.text}</span>
              <button
                type="button"
                data-testid="category-note-remove"
                onClick={() => removeNote(note.id)}
                aria-label={messages.customize.removeNote(note.text)}
                style={iconButtonStyle}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: space.md }}>
        <input
          type="text"
          value={draftText}
          onChange={(e) => setDraftText(e.target.value)}
          placeholder={messages.customize.notePlaceholder}
          aria-label={messages.customize.addNoteFor(categoryLabel(messages, category.key))}
          data-testid="category-note-input"
          style={{ flex: 1 }}
        />
        <button type="submit" data-testid="category-note-submit" style={primaryButtonStyle}>
          {messages.common.add}
        </button>
      </form>
    </div>
  )
}

/**
 * Personal free-text notes per category, describing what the user
 * personally considers essential/non-essential within it (e.g. under
 * "Frozen": "nuggets, frozen pizza"). Feeding these into the extraction
 * prompt so the AI can use them when judging essential/
 * non-essential for scanned items is a separate follow-up — this page is
 * just where the user creates/views/edits/deletes them.
 *
 * Each category is a native <details>/<summary> accordion — same pattern
 * already used by the DB Debug Panel and the Shopping List's own
 * collapsible section — rather than hand-rolled open/close state, so
 * tapping a header toggling it open/closed comes for free.
 */
/**
 * Sits in the title row rather than on its own line: the page is tuned so
 * all 11 category cards fit on one screen, and a separate row would push
 * the last ones below the fold.
 */
export function CustomizePage({ onBack }: { onBack: () => void }) {
  const messages = useT()
  return (
    <section data-testid="customize-page" style={pageStyle}>
      {/* Back button in the title row, not on its own line: the page is
          tuned so all 11 category cards fit one screen. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: space.md }}>
        <button
          type="button"
          data-testid="customize-back"
          aria-label={messages.customize.back}
          title={messages.customize.back}
          onClick={onBack}
          style={{ minHeight: '2.5rem', minWidth: '2.5rem', padding: `${space.sm} ${space.md}`, lineHeight: 1 }}
        >
          ←
        </button>
        <h1 style={{ marginRight: 'auto' }}>{messages.customize.title}</h1>
        <Mascot pose="excited" size={32} />
      </div>
      <p style={{ ...footnoteStyle, ...mutedTextStyle, marginTop: space.xs }}>
        {messages.customize.intro}
      </p>

      {/* All 11 categories in one card, hairline-divided — same grouped-list
          treatment as History and the Shopping List. */}
      <div className="gb-group" style={{ ...listGroupStyle, marginTop: space.lg }}>
        {CATEGORIES.map((category) => (
          <details
            key={category.key}
            data-testid="category-accordion"
            data-category-key={category.key}
            style={{ padding: `${space.md} ${space.lg}` }}
          >
            {/* minHeight (not more padding) so the row clears a 44px tap
                target while an expanded category's notes stay tight up
                against its header. */}
            <summary
              data-testid="category-accordion-toggle"
              style={{ display: 'flex', alignItems: 'center', minHeight: '1.75rem', fontWeight: 600, cursor: 'pointer' }}
            >
              {categoryLabel(messages, category.key)}
            </summary>
            <CategoryNotes category={category} />
          </details>
        ))}
      </div>
    </section>
  )
}
