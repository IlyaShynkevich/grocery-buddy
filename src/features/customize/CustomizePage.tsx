import { useState, type FormEvent } from 'react'
import { CATEGORIES, type Category } from '../../db/categories'
import { categoryLabel, useT } from '../../i18n'
import { cardStyle, iconButtonStyle, mutedTextStyle, pageStyle, primaryButtonStyle } from '../../lib/ui'
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
    <div style={{ padding: '0.75rem 0.1rem 0.1rem' }}>
      {notes.length === 0 ? (
        <p data-testid="category-notes-empty" style={mutedTextStyle}>
          {messages.customize.notesEmpty}
        </p>
      ) : (
        <ul
          data-testid="category-notes-list"
          style={{ listStyle: 'none', padding: 0, margin: '0 0 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}
        >
          {notes.map((note) => (
            <li
              key={note.id}
              data-testid="category-note"
              style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.5rem' }}
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

      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '0.5rem' }}>
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
export function CustomizePage() {
  const messages = useT()
  return (
    <section data-testid="customize-page" style={pageStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: '1.5rem' }}>{messages.customize.title}</h1>
        <Mascot pose="excited" size={32} />
      </div>
      <p style={{ ...mutedTextStyle, fontSize: '0.85rem', marginTop: '0.2rem' }}>
        {messages.customize.intro}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginTop: '0.6rem' }}>
        {CATEGORIES.map((category) => (
          <details
            key={category.key}
            data-testid="category-accordion"
            data-category-key={category.key}
            style={{ ...cardStyle, padding: '0.55rem 0.75rem' }}
          >
            <summary data-testid="category-accordion-toggle" style={{ fontWeight: 600, cursor: 'pointer' }}>
              {categoryLabel(messages, category.key)}
            </summary>
            <CategoryNotes category={category} />
          </details>
        ))}
      </div>
    </section>
  )
}
