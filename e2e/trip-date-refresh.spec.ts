import { expect, test } from '@playwright/test'

test('a draft trip left active overnight shows today\'s date on reopen, not the day it was created', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-07-30T10:00:00.000Z') })

  await page.goto('/')
  await expect(page.getByTestId('shopping-list')).toBeVisible()
  await expect(page.getByText('30.07.2026')).toBeVisible()

  // Simulate the app being reopened the next day, with the same draft
  // trip still pinned active (no new trip created in between — that's
  // the case that used to leave the date stale until Save trip).
  await page.clock.setFixedTime(new Date('2026-07-31T09:00:00.000Z'))
  await page.reload()

  await expect(page.getByTestId('shopping-list')).toBeVisible()
  await expect(page.getByText('31.07.2026')).toBeVisible()
  await expect(page.getByText('30.07.2026')).toHaveCount(0)
})
