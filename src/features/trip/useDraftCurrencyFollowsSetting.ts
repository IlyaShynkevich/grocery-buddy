import { useEffect, useState } from 'react'
import { syncDraftCurrency } from '../../db/db'
import { useCurrencySetting } from '../../settings/settingsStore'

/**
 * Keeps the active draft trip's currency in step with the currency setting
 * — on load and on every change — until the draft holds a priced item (see
 * syncDraftCurrency). Only the currency setting drives this: changing the
 * language never touches any trip's currency. Returns an error message if
 * it fails: the draft would otherwise silently stay in the previous
 * currency.
 */
export function useDraftCurrencyFollowsSetting(): string | null {
  const currency = useCurrencySetting()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setError(null)
    syncDraftCurrency(currency).then(
      (outcome) => {
        if (outcome === 'updated' || outcome === 'locked') {
          console.info(`Grocery Buddy: draft trip currency vs ${currency}: ${outcome}`)
        }
      },
      (err: unknown) => {
        console.error('Grocery Buddy: could not update the draft trip currency', err)
        setError(err instanceof Error ? err.message : String(err))
      },
    )
  }, [currency])

  return error
}
