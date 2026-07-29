import { useState, type FormEvent } from 'react'
import { useShoppingList } from './useShoppingList'

export function ShoppingListPage() {
  const { trip, items, addItem, renameItem, removeItem } = useShoppingList()
  const [draftName, setDraftName] = useState('')

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    await addItem(draftName)
    setDraftName('')
  }

  return (
    <section style={{ maxWidth: 480, margin: '0 auto', padding: '1rem', textAlign: 'left' }}>
      <h1 style={{ fontSize: '1.5rem' }}>Shopping List</h1>
      <p style={{ fontSize: '0.85rem', opacity: 0.7 }}>{trip ? trip.date : 'Loading trip…'}</p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <input
          type="text"
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          placeholder="Add an item…"
          aria-label="Item name"
          style={{ flex: 1, padding: '0.6rem', fontSize: '1rem' }}
        />
        <button type="submit" style={{ padding: '0.6rem 1rem', fontSize: '1rem' }}>
          Add
        </button>
      </form>

      {items.length === 0 && <p style={{ opacity: 0.6 }}>No items yet — add what you're picking up.</p>}

      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {items.map((item) => (
          <li
            key={item.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.4rem 0',
              borderBottom: '1px solid #e0e0e0',
            }}
          >
            <input
              type="text"
              value={item.name}
              onChange={(e) => renameItem(item.id, e.target.value)}
              aria-label={`Edit ${item.name}`}
              style={{ flex: 1, padding: '0.4rem', fontSize: '1rem', border: '1px solid transparent' }}
            />
            <button
              type="button"
              onClick={() => removeItem(item.id)}
              aria-label={`Remove ${item.name}`}
              style={{ padding: '0.4rem 0.7rem', fontSize: '1rem' }}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
