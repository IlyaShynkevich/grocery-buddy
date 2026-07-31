import { expect, test, type Page } from '@playwright/test'

// Touch emulation must be on for TouchEvent/Touch to behave like a real
// device in Chromium — this is what lets these tests exercise the actual
// touch-event code path (not a mouse-drag stand-in for it).
test.use({ hasTouch: true })

/**
 * Dispatches a real touchstart/touchmove.../touchend sequence, same as the
 * production swipe handler listens for. The touch's `target` is fixed to
 * whatever element is under the start point — matching real touch semantics,
 * where a touch keeps its original target for its whole lifetime even as it
 * moves elsewhere.
 */
async function touchSwipe(
  page: Page,
  { x1, y1, x2, y2, steps = 6 }: { x1: number; y1: number; x2: number; y2: number; steps?: number },
) {
  await page.evaluate(
    ({ x1, y1, x2, y2, steps }) => {
      const target = document.elementFromPoint(x1, y1) ?? document.body
      let nextId = 1

      function fire(type: string, x: number, y: number) {
        const touch = new Touch({ identifier: nextId, target, clientX: x, clientY: y })
        const touches = type === 'touchend' ? [] : [touch]
        target.dispatchEvent(
          new TouchEvent(type, {
            bubbles: true,
            cancelable: true,
            touches,
            targetTouches: touches,
            changedTouches: [touch],
          }),
        )
      }

      fire('touchstart', x1, y1)
      for (let i = 1; i <= steps; i++) {
        fire('touchmove', x1 + ((x2 - x1) * i) / steps, y1 + ((y2 - y1) * i) / steps)
      }
      fire('touchend', x2, y2)
      nextId += 1
    },
    { x1, y1, x2, y2, steps },
  )
}

/** A point safely inside the current page's content — low enough to clear
 * the heading/button row at the top of every page, so the touch doesn't
 * start on an interactive element. */
async function contentPoint(page: Page, testId: string): Promise<{ x: number; y: number }> {
  const box = await page.getByTestId(testId).boundingBox()
  if (!box) throw new Error(`no bounding box for ${testId}`)
  return { x: box.x + box.width / 2, y: box.y + box.height * 0.8 }
}

// The incoming page is still mid-slide (translated, not yet at rest) for the
// ~220ms the tab-switch animation runs — boundingBox() reports its current
// (moving) position, not its resting one, and doesn't wait for the animation
// to settle the way Playwright's own actionability checks do. Chaining
// another swipe off that box would compute touch coordinates from wherever
// the page happened to be mid-slide. Waiting the animation out first is what
// a real, not-superhumanly-fast swipe-swipe-swipe would do anyway.
const ANIMATION_SETTLE_MS = 300

test('swipe left moves forward through the tabs in order', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('shopping-list')).toBeVisible()

  let point = await contentPoint(page, 'shopping-list')
  await touchSwipe(page, { x1: point.x + 150, y1: point.y, x2: point.x - 150, y2: point.y })
  await expect(page.getByTestId('history-page')).toBeVisible()
  await page.waitForTimeout(ANIMATION_SETTLE_MS)

  point = await contentPoint(page, 'history-page')
  await touchSwipe(page, { x1: point.x + 150, y1: point.y, x2: point.x - 150, y2: point.y })
  await expect(page.getByTestId('stats-page')).toBeVisible()
})

test('swipe right moves backward through the tabs in order', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('nav-stats').click()
  await expect(page.getByTestId('stats-page')).toBeVisible()
  await page.waitForTimeout(ANIMATION_SETTLE_MS)

  let point = await contentPoint(page, 'stats-page')
  await touchSwipe(page, { x1: point.x - 150, y1: point.y, x2: point.x + 150, y2: point.y })
  await expect(page.getByTestId('history-page')).toBeVisible()
  await page.waitForTimeout(ANIMATION_SETTLE_MS)

  point = await contentPoint(page, 'history-page')
  await touchSwipe(page, { x1: point.x - 150, y1: point.y, x2: point.x + 150, y2: point.y })
  await expect(page.getByTestId('shopping-list')).toBeVisible()
})

test('swiping past either edge does not wrap around', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('shopping-list')).toBeVisible()

  // Already on the first tab — swiping right (backward) must do nothing.
  let point = await contentPoint(page, 'shopping-list')
  await touchSwipe(page, { x1: point.x - 150, y1: point.y, x2: point.x + 150, y2: point.y })
  await expect(page.getByTestId('shopping-list')).toBeVisible()

  // Move to the last tab, then swiping left (forward) must do nothing.
  await page.getByTestId('nav-stats').click()
  await expect(page.getByTestId('stats-page')).toBeVisible()
  await page.waitForTimeout(ANIMATION_SETTLE_MS)
  point = await contentPoint(page, 'stats-page')
  await touchSwipe(page, { x1: point.x + 150, y1: point.y, x2: point.x - 150, y2: point.y })
  await expect(page.getByTestId('stats-page')).toBeVisible()
})

test('a vertical scroll gesture does not trigger a tab change', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('shopping-list')).toBeVisible()

  const point = await contentPoint(page, 'shopping-list')
  // Mostly-vertical travel with only a small horizontal component — this is
  // what a normal scroll gesture looks like, and must not be read as a swipe.
  await touchSwipe(page, { x1: point.x, y1: point.y - 100, x2: point.x + 15, y2: point.y + 100 })

  await expect(page.getByTestId('shopping-list')).toBeVisible()
  await expect(page.getByTestId('history-page')).toHaveCount(0)
})

test('tapping the tab bar still works exactly as before, alongside swipe', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('shopping-list')).toBeVisible()

  await page.getByTestId('nav-history').click()
  await expect(page.getByTestId('history-page')).toBeVisible()

  await page.getByTestId('nav-shopping').click()
  await expect(page.getByTestId('shopping-list')).toBeVisible()
})

/**
 * Dispatches a *trusted* touch swipe via Chrome DevTools Protocol, unlike
 * `touchSwipe` above (which fires untrusted `dispatchEvent`s — those never
 * drive the browser's own default-action/gesture machinery, which is fine
 * for testing this app's own JS logic in isolation, but doesn't reliably
 * exercise real button/gesture interaction the way an actual finger would).
 * Needed here because the bug this covers only reproduced with trusted
 * input during investigation.
 */
async function cdpTouchSwipe(
  page: Page,
  { x1, y1, x2, y2, steps = 10 }: { x1: number; y1: number; x2: number; y2: number; steps?: number },
) {
  const client = await page.context().newCDPSession(page)
  for (let i = 0; i <= steps; i++) {
    await client.send('Input.dispatchTouchEvent', {
      type: i === 0 ? 'touchStart' : 'touchMove',
      touchPoints: [{ x: x1 + ((x2 - x1) * i) / steps, y: y1 + ((y2 - y1) * i) / steps, id: 1 }],
    })
    await page.waitForTimeout(16)
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}

test('swiping starting directly on a history-trip button still switches tabs', async ({ page }) => {
  await page.goto('/')
  // Enough trips that history-trip buttons (cardStyle, width: 100%, only an
  // 8px gap between rows) cover essentially the whole visible list — a
  // touch "in the middle of the scrollable list" is, in practice, a touch
  // starting on one of these buttons.
  for (let i = 0; i < 15; i++) {
    await page.getByTestId('add-item-input').fill(`Item ${i}`)
    await page.getByTestId('add-item-submit').click()
    const tripId = await page.getByTestId('shopping-list').getAttribute('data-trip-id')
    await page.getByTestId('save-trip-button').click()
    await expect.poll(() => page.getByTestId('shopping-list').getAttribute('data-trip-id')).not.toBe(tripId)
  }

  await page.getByTestId('nav-history').click()
  await expect(page.getByTestId('history-page')).toBeVisible()
  await page.waitForTimeout(ANIMATION_SETTLE_MS)

  const box = await page.getByTestId('history-trip').first().boundingBox()
  if (!box) throw new Error('no bounding box for history-trip')
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2

  await cdpTouchSwipe(page, { x1: x + 100, y1: y, x2: x - 100, y2: y })
  await expect(page.getByTestId('stats-page')).toBeVisible()
})

test('outgoing and incoming tab panels stay fully opaque during a transition', async ({ page }) => {
  // The outgoing and incoming panels use different (asymmetric) easing
  // curves, so they don't stay a constant panel-width apart mid-animation —
  // they briefly overlap geometrically (this is expected, not a bug: see
  // TabTransition.tsx). What must hold is that wherever they overlap, only
  // one is visible — i.e. both panels paint as fully opaque sheets, so
  // whichever one is on top (the outgoing one, by default stacking order)
  // completely occludes the other rather than both pages' text showing
  // through simultaneously.
  await page.goto('/')
  await expect(page.getByTestId('shopping-list')).toBeVisible()

  // Start a rAF sampler before the switch so every frame of the ~300ms
  // transition is captured with no round-trip latency between samples.
  await page.evaluate(() => {
    ;(window as unknown as { __alphas: number[] }).__alphas = []
    const alphas = (window as unknown as { __alphas: number[] }).__alphas
    const start = performance.now()
    function alphaOf(color: string): number {
      const match = color.match(/rgba?\(([^)]+)\)/)
      if (!match) return color === 'transparent' ? 0 : 1
      const parts = match[1].split(',').map((p) => Number.parseFloat(p))
      return parts.length === 4 ? parts[3] : 1
    }
    function tick() {
      const slides = Array.from(document.querySelectorAll('.gb-tab-slide'))
      if (slides.length === 2) {
        for (const el of slides) {
          alphas.push(alphaOf(getComputedStyle(el).backgroundColor))
        }
      }
      if (performance.now() - start < 400) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })

  await page.getByTestId('nav-history').click()
  await page.waitForTimeout(450)

  const alphas = await page.evaluate(() => (window as unknown as { __alphas: number[] }).__alphas)
  expect(alphas.length).toBeGreaterThan(0)
  for (const alpha of alphas) {
    expect(alpha).toBe(1)
  }
})

test('the outgoing page keeps its DOM node identity instead of remounting when a transition starts', async ({
  page,
}) => {
  // Regression test for a "flick" right before the slide animation: the
  // outgoing panel's wrapper used to be keyed differently (`outgoing-${tab}`)
  // than the same tab's wrapper had been keyed while it was still current
  // (`current-${tab}`), so React saw a key change and remounted that tab's
  // whole subtree — losing already-loaded live-query data and any local
  // state — right as the transition started, before the CSS animation ever
  // painted a frame. Marking the live DOM node and checking it survives the
  // switch (not just that the page eventually looks right) is what actually
  // encodes "no remount happened."
  await page.goto('/')
  await expect(page.getByTestId('shopping-list')).toBeVisible()

  await page.evaluate(() => {
    document.querySelector('[data-testid="shopping-list"]')!.setAttribute('data-canary', 'no-remount')
  })

  await page.getByTestId('nav-history').click()

  // Checked immediately, deliberately not waiting for the transition to
  // settle — a remount happens synchronously in the same commit that starts
  // the transition, so if the canary is gone here, it was never about the
  // animation timing.
  await expect(page.locator('[data-canary="no-remount"]')).toHaveCount(1)

  // Once the transition genuinely finishes, the outgoing panel is removed
  // for real — the canary should be gone by then.
  await page.waitForTimeout(ANIMATION_SETTLE_MS)
  await expect(page.locator('[data-canary="no-remount"]')).toHaveCount(0)
})

test('Debug tools and the footer stay outside the sliding tab content and are unaffected by a transition', async ({
  page,
}) => {
  // Debug tools + the footer are static siblings of TabTransition now, not
  // wrapped by it — this asserts that structure directly (both are present
  // and outside `.gb-tab-slide` throughout a transition), rather than
  // measuring animation smoothness, which this area deliberately no longer
  // tries to guarantee — see CLAUDE.md ("Stats<->History height animation").
  await page.goto('/')
  await page.getByTestId('debug-panel-toggle').click()

  await page.getByTestId('nav-history').click()
  await expect(page.getByTestId('app-footer')).toBeVisible()
  await expect(page.getByTestId('debug-panel-toggle')).toBeVisible()
  const slideCount = await page.locator('.gb-tab-slide').count()
  expect(slideCount).toBeGreaterThan(0)
  await expect(page.locator('.gb-tab-slide [data-testid="app-footer"]')).toHaveCount(0)
  await expect(page.locator('.gb-tab-slide [data-testid="debug-panel-toggle"]')).toHaveCount(0)

  await page.waitForTimeout(ANIMATION_SETTLE_MS)
  await expect(page.getByTestId('app-footer')).toBeVisible()
})

test('Debug tools is hidden on Stats instantly, with no settle delay, same as the tab bar highlight', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.getByTestId('debug-panel-toggle')).toBeVisible()

  await page.getByTestId('nav-stats').click()
  // No wait for the slide to settle — Debug tools is gated directly on the
  // active tab, the same plain conditional as the tab bar's own highlight.
  await expect(page.getByTestId('debug-panel-toggle')).toHaveCount(0)

  await page.getByTestId('nav-shopping').click()
  await expect(page.getByTestId('debug-panel-toggle')).toBeVisible()
})
