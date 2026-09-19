import { useState, type FormEvent } from 'react'
import { CATEGORIES, type Category } from '../../db/categories'
import { categoryLabel, useT } from '../../i18n'
import type { Currency } from '../../i18n/currencies'
import type { Language } from '../../i18n/languages'
import { LANGUAGES, setCurrency, setLanguage, useSettings } from '../../settings/settingsStore'
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
/**
 * Sits in the title row rather than on its own line: the page is tuned so
 * all 11 category cards fit on one screen, and a separate row would push
 * the last ones below the fold.
 */
// Interim: language and currency are independent settings now, but until
// the Settings page exists this single picker still offers the two
// combinations that existed before and sets both.
const COMBINED_OPTIONS: { id: string; label: string; language: Language; currency: Currency }[] = [
  { id: 'en-EUR', label: `${LANGUAGES.en.label} · EUR`, language: 'en', currency: 'EUR' },
  { id: 'ru-BYN', label: `${LANGUAGES.ru.label} · BYN`, language: 'ru', currency: 'BYN' },
]

function RegionPicker() {
  const messages = useT()
  const settings = useSettings()
  const [saveError, setSaveError] = useState<string | null>(null)
  const selected = COMBINED_OPTIONS.find((o) => o.language === settings.language && o.currency === settings.currency)

  const handleChange = (id: string) => {
    const option = COMBINED_OPTIONS.find((o) => o.id === id)
    if (!option) {
      console.error(`Grocery Buddy: unknown region picked: ${JSON.stringify(id)}`)
      return
    }
    setSaveError(null)
    try {
      setLanguage(option.language)
      setCurrency(option.currency)
    } catch (err) {
      console.error('Grocery Buddy: could not save the language setting', err)
      // Rendered in the (already switched) new language.
      setSaveError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <>
      <select
        data-testid="region-select"
        aria-label={messages.customize.region}
        title={messages.customize.region}
        value={selected?.id ?? ''}
        onChange={(e) => handleChange(e.target.value)}
        style={{ minHeight: '2.5rem', minWidth: 0, flexShrink: 1 }}
      >
        {COMBINED_OPTIONS.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
      {saveError && (
        <p role="alert" data-testid="region-save-error" style={{ color: 'var(--danger)', fontSize: '0.85rem', flexBasis: '100%' }}>
          {messages.customize.regionSaveFailed(saveError)}
        </p>
      )}
    </>
  )
}

export function CustomizePage() {
  const messages = useT()
  return (
    <section data-testid="customize-page" style={pageStyle}>
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', marginRight: 'auto' }}>{messages.customize.title}</h1>
        <RegionPicker />
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
