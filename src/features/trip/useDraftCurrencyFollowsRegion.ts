import { useEffect, useState } from 'react'
import { syncDraftCurrency } from '../../db/db'
import { useRegion } from '../../i18n/regionStore'

/**
 * Keeps the active draft trip's currency in step with the region — on load
 * and on every switch — until the draft holds a priced item (see
 * syncDraftCurrency). Returns an error message if that fails: the draft
 * would otherwise silently stay in the previous currency.
 */
export function useDraftCurrencyFollowsRegion(): string | null {
  const region = useRegion()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setError(null)
    syncDraftCurrency(region.currency).then(
      (outcome) => {
        if (outcome === 'updated' || outcome === 'locked') {
          console.info(`Grocery Buddy: draft trip currency vs ${region.currency}: ${outcome}`)
        }
      },
      (err: unknown) => {
        console.error('Grocery Buddy: could not update the draft trip currency', err)
        setError(err instanceof Error ? err.message : String(err))
      },
    )
  }, [region.currency])

  return error
}
