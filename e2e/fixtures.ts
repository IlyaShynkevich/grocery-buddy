import { test as base, expect as baseExpect, type Locator, type Page } from '@playwright/test'

/**
 * Every existing spec assumes `page.goto('/')` lands directly on Shopping
 * List — that was true until Home (App.tsx's readInitialView) started
 * intercepting a genuinely fresh session (sessionStorage's homeSeen flag not
 * yet set) and showing Home first instead. Pre-seeding that flag before each
 * test's first navigation keeps every existing spec's assumption true
 * without editing 19 files' worth of test bodies — only Home-specific specs
 * (see home.spec.ts) need the real fresh-launch path, and they clear this
 * flag themselves.
 */
export const test = base.extend<{ page: Page; debugTools: boolean }>({
  /**
   * Debug tools is hidden unless switched on for the session (the secret
   * Home-mascot gesture, see src/features/debug/debugTools.ts) — off by
   * default here too, like the real app. Specs that drive the panel opt in
   * with `test.use({ debugTools: true })`, which pre-sets the same session
   * flag the gesture writes.
   */
  debugTools: [false, { option: true }],
  page: async ({ page, debugTools }, use) => {
    await page.addInitScript((debug) => {
      window.sessionStorage.setItem('grocery-buddy:homeSeenThisSession', '1')
      if (debug) window.sessionStorage.setItem('grocery-buddy:debugTools', '1')
    }, debugTools)
    await use(page)
  },
})

export const expect = baseExpect

/** Customize isn't in the nav bar — it's reached from a button on Settings. */
export async function openCustomize(page: Page) {
  await page.getByTestId('nav-settings').click()
  await page.getByTestId('settings-open-customize').click()
  await expect(page.getByTestId('customize-page')).toBeVisible()
}

/**
 * Debug tools' contents only mount while the panel is open (see
 * DbDebugPanel), and it's closed again after any reload or tab switch —
 * call this before reading anything inside it. No-op if already open, since
 * clicking the toggle then would close it.
 */
export async function openDebugPanel(page: Page) {
  const panel = page.getByTestId('debug-panel')
  if (!(await panel.evaluate((el) => (el as HTMLDetailsElement).open))) {
    await page.getByTestId('debug-panel-toggle').click()
  }
  await expect(panel).toHaveAttribute('open', '')
}
export type { Locator, Page }
