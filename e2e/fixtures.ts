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
export type { Locator, Page }
