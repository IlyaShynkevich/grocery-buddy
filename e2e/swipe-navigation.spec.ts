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
