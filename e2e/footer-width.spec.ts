import { expect, test } from './fixtures'

test("the footer's rendered width matches the page content's capped width, not the full viewport", async ({
  page,
}) => {
  await page.goto('/')

  const viewportWidth = page.viewportSize()!.width
  const footerBox = await page.getByTestId('app-footer').boundingBox()
  const pageBox = await page.getByTestId('shopping-list').boundingBox()

  expect(footerBox).not.toBeNull()
  expect(pageBox).not.toBeNull()

  // Same capped width as every other page section (pageStyle's maxWidth:
  // 480), not stretched edge to edge.
  expect(footerBox!.width).toBeCloseTo(pageBox!.width, 0)
  expect(footerBox!.width).toBeLessThan(viewportWidth)
  expect(footerBox!.width).toBeLessThanOrEqual(480)

  // And it's centered, not just capped and left-aligned — equal-ish gap on
  // both sides of the viewport.
  const leftGap = footerBox!.x
  const rightGap = viewportWidth - (footerBox!.x + footerBox!.width)
  expect(Math.abs(leftGap - rightGap)).toBeLessThan(2)
})
