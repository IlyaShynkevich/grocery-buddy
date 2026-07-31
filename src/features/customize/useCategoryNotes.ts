import { useLiveQuery } from 'dexie-react-hooks'
import { db, newCategoryNote } from '../../db/db'

/** A category's own personal essential/non-essential notes, oldest first. */
export function useCategoryNotes(categoryKey: string) {
  const notes = useLiveQuery(() => db.categoryNotes.where('categoryKey').equals(categoryKey).sortBy('id'), [categoryKey], [])

  const addNote = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return
    await db.categoryNotes.add(newCategoryNote(categoryKey, trimmed))
  }

  const removeNote = async (noteId: number) => {
    await db.categoryNotes.delete(noteId)
  }

  return { notes, addNote, removeNote }
}
