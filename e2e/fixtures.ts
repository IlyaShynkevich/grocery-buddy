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
export const test = base.extend<{ page: Page }>({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      window.sessionStorage.setItem('grocery-buddy:homeSeenThisSession', '1')
    })
    await use(page)
  },
})

export const expect = baseExpect

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
