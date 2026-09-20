import { expect, test, type Page } from './fixtures'

// The mascot's idle hop (index.css's .gb-mascot-hop), applied to the two
// pages where the mascot is a large centred character — Home and About —
// and deliberately nowhere else.

test.use({ viewport: { width: 393, height: 777 } })

/** A transform that is doing nothing, however the browser spells it. */
const RESTING = ['none', 'matrix(1, 0, 0, 1, 0, 0)']

async function goHome(page: Page) {
  await page.getByTestId('nav-home').click()
  await expect(page.getByTestId('home-mascot')).toBeVisible()
}

/** The running animation on `testId`, paused so it can be stepped frame by frame. */
async function pauseHop(page: Page, testId: string): Promise<number> {
  return page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`)!
    const animations = el.getAnimations()
    if (animations.length !== 1) throw new Error(`expected exactly one animation on ${id}, found ${animations.length}`)
    animations[0].pause()
    const duration = Number(animations[0].effect?.getTiming().duration ?? 0)
    if (!duration) throw new Error(`${id}'s animation has no duration`)
    return duration
  }, testId)
}

async function seek(page: Page, testId: string, timeMs: number) {
  await page.evaluate(
    ({ id, timeMs }) => {
      const el = document.querySelector(`[data-testid="${id}"]`)!
      for (const animation of el.getAnimations()) animation.currentTime = timeMs
    },
    { id: testId, timeMs },
  )
}

const transformOf = (page: Page, testId: string) =>
  page.evaluate((id) => getComputedStyle(document.querySelector(`[data-testid="${id}"]`)!).transform, testId)

test('the Home mascot hops, and actually leaves the ground partway through the cycle', async ({ page }) => {
  await page.goto('/')
  await goHome(page)

  const duration = await pauseHop(page, 'home-mascot')
  expect(duration, 'hop cycle length').toBe(3200)

  // Sample the whole cycle: it must rest at the start, and at some point
  // be both visibly airborne and visibly squashed. Asserting on the real
  // computed transform (not just "a class is present") is what makes this
  // fail if the keyframes are ever gutted.
  const samples: Array<{ t: number; transform: string }> = []
  for (let t = 0; t < duration; t += 50) {
    await seek(page, 'home-mascot', t)
    samples.push({ t, transform: await transformOf(page, 'home-mascot') })
  }

  expect(RESTING, 'the cycle must start at rest').toContain(samples[0].transform)

  const parsed = samples.map(({ t, transform }) => {
    const numbers = transform.startsWith('matrix(') ? transform.slice(7, -1).split(',').map(Number) : [1, 0, 0, 1, 0, 0]
    // matrix(scaleX, skewY, skewX, scaleY, translateX, translateY)
    return { t, scaleX: numbers[0], scaleY: numbers[3], translateY: numbers[5] }
  })

  const highest = parsed.reduce((lowest, s) => (s.translateY < lowest.translateY ? s : lowest))
  expect(highest.translateY, 'the mascot should lift clear off the ground').toBeLessThan(-10)
  expect(highest.scaleY, 'it should be stretched at the top of the arc').toBeGreaterThan(1)

  const widest = parsed.reduce((most, s) => (s.scaleX > most.scaleX ? s : most))
  expect(widest.scaleX, 'it should squash wide on the crouch and the landing').toBeGreaterThan(1.05)
  expect(widest.scaleY, 'squashing wide must also mean squashing short').toBeLessThan(1)
})

test('the hop waits about two seconds between hops, and the hop itself keeps its shape', async ({ page }) => {
  await page.goto('/')
  await goHome(page)
  const duration = await pauseHop(page, 'home-mascot')

  const STEP_MS = 25
  let stillSteps = 0
  let total = 0
  for (let t = 0; t < duration; t += STEP_MS) {
    await seek(page, 'home-mascot', t)
    if (RESTING.includes(await transformOf(page, 'home-mascot'))) stillSteps++
    total++
  }

  // Deliberately in milliseconds, not as a fraction of the cycle. The
  // keyframe offsets are percentages, so the still *fraction* stays the
  // same no matter what the duration is — a fraction-based assertion here
  // passed happily against a 1.8s cycle, which is a frantic bounce, and
  // proved nothing. These two numbers are what actually describe the
  // motion, and between them they pin both halves of it:
  //   - the gap is how often you see a hop ("roughly every 3 seconds")
  //   - the motion is the hop's own speed, which must not change when the
  //     cycle is retuned; crouch/stretch/land/overshoot take what they take
  const stillMs = (stillSteps / total) * duration
  const motionMs = duration - stillMs
  expect(stillMs, 'quiet stretch between hops').toBeGreaterThan(1500)
  expect(stillMs, 'quiet stretch between hops').toBeLessThan(2600)
  expect(motionMs, "the hop's own duration").toBeGreaterThan(1150)
  expect(motionMs, "the hop's own duration").toBeLessThan(1500)
})

test('prefers-reduced-motion disables the hop entirely', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await goHome(page)

  const mascot = page.getByTestId('home-mascot')
  await expect(mascot).toBeVisible()
  expect(await mascot.evaluate((el) => el.getAnimations().length), 'no running animation under reduced motion').toBe(0)
  expect(RESTING).toContain(await transformOf(page, 'home-mascot'))

  // And the same on About.
  await page.getByTestId('nav-about').click()
  await expect(page.getByTestId('about-mascot')).toBeVisible()
  expect(await page.getByTestId('about-mascot').evaluate((el) => el.getAnimations().length)).toBe(0)
})

for (const [pageName, navTestId, mascotTestId, sectionTestId] of [
  ['Home', 'nav-home', 'home-mascot', 'home-page'],
  ['About', 'nav-about', 'about-mascot', 'about-page'],
] as const) {
  test(`${pageName} does not grow, shrink or shift anything while the mascot hops`, async ({ page }) => {
    await page.goto('/')
    await page.getByTestId(navTestId).click()
    await expect(page.getByTestId(mascotTestId)).toBeVisible()
    const duration = await pauseHop(page, mascotTestId)

    // Every page in this app is tuned to fit one 393x777 screen with very
    // little slack, so a hop that touched layout would push the footer
    // off-screen once per cycle.
    //
    // Page height and footer position alone are not enough to catch that,
    // which a mutation check proved: Home is a centred `flex: 1` section
    // with 300px of spare room, so giving the mascot a margin at the top
    // of its arc left the document height and the footer exactly where
    // they were and only shoved the CTA down. So this also snapshots the
    // box of every other element in the section — anything the hop could
    // push — and requires all of them to be identical at every point in
    // the cycle. The mascot wrapper and its contents are excluded, since
    // moving is their whole job.
    const measure = () =>
      page.evaluate(
        ({ sectionTestId, mascotTestId }) => {
          const section = document.querySelector(`[data-testid="${sectionTestId}"]`)!
          const mascot = document.querySelector(`[data-testid="${mascotTestId}"]`)!
          const footer = document.querySelector('[data-testid="app-footer"]')!.getBoundingClientRect()
          const box = (el: Element) => {
            const rect = el.getBoundingClientRect()
            const id = el.getAttribute('data-testid') ?? el.tagName
            return `${id} ${Math.round(rect.x)},${Math.round(rect.y)},${Math.round(rect.width)},${Math.round(rect.height)}`
          }
          return {
            scrollHeight: document.documentElement.scrollHeight,
            overflow: document.documentElement.scrollHeight - window.innerHeight,
            footerTop: Math.round(footer.top),
            horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth,
            siblingBoxes: Array.from(section.querySelectorAll('*'))
              .filter((el) => el !== mascot && !mascot.contains(el))
              .map(box),
          }
        },
        { sectionTestId, mascotTestId },
      )

    await seek(page, mascotTestId, 0)
    const atRest = await measure()
    expect(atRest.overflow, `${pageName} already overflows at rest`).toBeLessThanOrEqual(0)
    expect(atRest.siblingBoxes.length, `${pageName} has nothing to push, so this proves nothing`).toBeGreaterThan(0)

    for (let t = 0; t < duration; t += 50) {
      await seek(page, mascotTestId, t)
      expect(await measure(), `${pageName} layout moved at ${t}ms into the hop`).toEqual(atRest)
    }
  })
}

test('the triple-tap Debug tools gesture still works while the mascot is hopping', async ({ page }) => {
  await page.goto('/')
  await goHome(page)

  // First with the animation running, exactly as a real tap would land.
  await page.getByTestId('home-mascot').click()
  await page.getByTestId('home-mascot').click()
  await page.getByTestId('home-mascot').click()
  await expect(page.getByTestId('toast')).toHaveText('Debug tools enabled')

  // Then pinned at the top of the arc — the worst case, where the mascot
  // is furthest from where it rests. Hit-testing follows the transform, so
  // the tap target has to have travelled with it; this is why the hop is
  // on the element carrying the handler rather than on an inner wrapper.
  const duration = await pauseHop(page, 'home-mascot')
  await seek(page, 'home-mascot', duration * 0.7375) // the peak keyframe

  const airborne = await page.getByTestId('home-mascot').boundingBox()
  const resting = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="home-mascot"]')! as HTMLElement
    for (const animation of el.getAnimations()) animation.currentTime = 0
    const box = el.getBoundingClientRect()
    for (const animation of el.getAnimations()) animation.currentTime = 3200 * 0.7375
    return { y: box.y }
  })
  expect(airborne!.y, 'the tap target should have moved up with the mascot').toBeLessThan(resting.y - 10)

  await page.getByTestId('home-mascot').click()
  await page.getByTestId('home-mascot').click()
  await page.getByTestId('home-mascot').click()
  await expect(page.getByTestId('toast')).toHaveText('Debug tools hidden')
})

/**
 * Scoped to the mascot images themselves, not `document.getAnimations()` —
 * the latter also returns the tab-slide transition that is still running
 * right after a tab switch, which has nothing to do with the mascot.
 */
const mascotAnimationReport = (page: Page) =>
  page.evaluate(() => {
    const mascots = Array.from(document.querySelectorAll('[data-testid="mascot"]'))
    return {
      mascots: mascots.length,
      animated: mascots.filter((el) => el.getAnimations({ subtree: true }).length > 0).length,
      insideHopWrapper: mascots.filter((el) => el.closest('.gb-mascot-hop') !== null).length,
    }
  })

test('the small title-row mascots stay completely still', async ({ page }) => {
  await page.goto('/')

  for (const [tab, ready] of [
    ['nav-shopping', 'shopping-list'],
    ['nav-history', 'history-page'],
    ['nav-stats', 'stats-page'],
    ['nav-settings', 'settings-page'],
  ] as const) {
    await page.getByTestId(tab).click()
    await expect(page.getByTestId(ready)).toBeVisible()
    // The tab-slide keeps the outgoing page mounted for the length of the
    // transition, so measuring straight away sees both tabs' mascots. The
    // count isn't what's being asserted, but waiting keeps it meaningful.
    await page.waitForTimeout(400)
    const report = await mascotAnimationReport(page)
    expect(report.mascots, `${tab} has no mascot, so this assertion proves nothing`).toBeGreaterThanOrEqual(1)
    expect(report, `${tab}'s mascots`).toMatchObject({ animated: 0, insideHopWrapper: 0 })
  }

  // Customize too — it is reached from Settings, not the nav bar.
  await page.getByTestId('nav-settings').click()
  await page.getByTestId('settings-open-customize').click()
  await expect(page.getByTestId('customize-page')).toBeVisible()
  const customize = await mascotAnimationReport(page)
  expect(customize.mascots).toBeGreaterThanOrEqual(1)
  expect(customize, "Customize's mascot").toMatchObject({ animated: 0, insideHopWrapper: 0 })
})
