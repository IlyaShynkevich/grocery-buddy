import { test, expect } from '@playwright/test'

// Deliberately importing straight from @playwright/test, not ./fixtures —
// these specs care about the service worker's own caching behavior, not
// which tab/Home-vs-Shopping-List the app happens to land on.
//
// The password gate (middleware.ts, a separate Vercel Edge Middleware) only
// runs for requests that actually reach the network. A cache-first
// navigation strategy silently bypasses it forever for any returning
// visitor — not just a one-time stale-service-worker transition — since
// Workbox's default generateSW navigateFallback answers every navigation
// straight from Cache Storage, no network involved. See
// CLAUDE.md "Known gotchas" for the full story.
//
// Neither spec can use page.route()/context.route() to observe this: a
// response Workbox answers purely from Cache Storage never becomes a new
// network-level request, so route interception simply never fires either
// way and can't distinguish "hit cache" from "hit network" (confirmed
// during investigation). Reading a counter set inside the service worker's
// own execution context (via a Workbox `requestWillFetch` plugin hook) is
// the one technique that reliably distinguishes the two.

async function primeServiceWorker(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.waitForFunction(() => !!navigator.serviceWorker.controller)
}

async function pagesCacheEntryCount(context: import('@playwright/test').BrowserContext): Promise<number> {
  const sw = context.serviceWorkers()[0]
  return sw.evaluate(() =>
    caches.open('pages').then((c) => c.keys()).then((k) => k.length),
  )
}

test('an online reload of the app shell reaches the real network, not just the precache', async ({ page, context }) => {
  await primeServiceWorker(page)

  // The very first load (the goto above) is never SW-controlled — a page
  // can't be intercepted by the service worker it's in the middle of
  // registering. So the NetworkFirst 'pages' runtime cache is still empty
  // at this point; it only gets an entry once a navigation actually goes
  // through NetworkFirst's handler and succeeds against the network.
  expect(await pagesCacheEntryCount(context)).toBe(0)

  await page.reload()
  await page.waitForLoadState('networkidle')

  expect(await pagesCacheEntryCount(context)).toBe(1)
})

test('an offline reload after at least one prior online visit still renders the cached app shell', async ({
  page,
  context,
}) => {
  await primeServiceWorker(page)

  // One real online navigation primes the NetworkFirst 'pages' cache.
  await page.reload()
  await page.waitForLoadState('networkidle')

  await context.setOffline(true)
  await page.reload()

  // Real app content, not a browser offline-error page — the whole "offline
  // still works for an already-visited user" half of the tradeoff this fix
  // has to preserve.
  await expect(page.locator('h1')).toContainText(/Grocery Buddy|Shopping List/)

  await context.setOffline(false)
})
