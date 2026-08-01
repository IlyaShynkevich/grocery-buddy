import { expect, test, type Page } from '@playwright/test'

// Same 1x1 PNG fixture used in the other receipt specs.
const SAMPLE_IMAGE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

async function captureReceipt(page: Page) {
  await page.getByTestId('receipt-capture-input').setInputFiles({
    name: 'receipt.png',
    mimeType: 'image/png',
    buffer: SAMPLE_IMAGE,
  })
  await expect(page.getByTestId('receipt-item')).toHaveCount(1)
}

/** Mimics the shape of the real OpenAI 429 message our server forwards as `error`. */
function rateLimitError(seconds: number) {
  return JSON.stringify({
    error: `OpenAI returned 429: {"error":{"message":"Rate limit reached for gpt-4.1-mini in organization org-abc123 on requests per min (RPM): Limit 3, Used 3, Requested 1. Please try again in ${seconds}s.","type":"requests","param":null,"code":"rate_limit_exceeded"}}`,
  })
}

/**
 * Mimics the real OpenAI token-per-minute rate-limit body
 * (`"type": "tokens"`, `"code": "rate_limit_exceeded"`) and the message our
 * server forwards for it: openaiExtract.ts detects this exact body shape and
 * tags the forwarded `error` string with a "(token limit)" marker, which is
 * what errorMessage.ts's isOpenAiTokenLimitError keys off of.
 */
function tokenLimitError() {
  const openAiBody = JSON.stringify({
    error: {
      message:
        'Request too large for gpt-4.1-mini in organization org-abc123 on tokens per min (TPM): Limit 200000, Requested 205482. Please reduce your message size and try again.',
      type: 'tokens',
      code: 'rate_limit_exceeded',
    },
  })
  return JSON.stringify({ error: `OpenAI returned 429 (token limit): ${openAiBody.slice(0, 300)}` })
}

/**
 * Mimics the message our server forwards when OpenAI's response itself was
 * truncated — `finish_reason: "length"`, not a non-2xx status — and salvage
 * still couldn't recover any complete items. openaiExtract.ts tags this
 * with a stable "(truncated)" marker and forwards it as a 502 (a plain
 * Error, not an OpenAiHttpError carrying a real OpenAI status), since the
 * response OpenAI sent back was itself a 200.
 */
function truncatedResponseError() {
  return JSON.stringify({
    error:
      'OpenAI response was truncated (truncated) by max_completion_tokens: {"items":[{"name":"Milk","price":3.49,"category":"dairy","isDiscount":false},{"name":"Eggs","price":4.2,"category"',
  })
}

test('auto-retries after the parsed rate-limit wait, with no manual interaction', async ({ page }) => {
  let callCount = 0
  await page.route('**/api/extract-receipt', (route) => {
    callCount += 1
    if (callCount === 1) {
      return route.fulfill({ status: 429, contentType: 'application/json', body: rateLimitError(1) })
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [{ name: 'Milk', price: 3.49, category: 'dairy' }] }),
    })
  })

  await page.goto('/')
  await captureReceipt(page)
  await page.getByTestId('receipt-process-button').click()

  await expect(page.getByTestId('receipt-status').first()).toHaveText(/Retrying in \d+s/)
  // manual Retry stays available throughout the wait
  await expect(page.getByTestId('receipt-process-button')).toHaveText('Retry')

  // no click here — the retry must fire on its own once the wait elapses
  await expect(page.getByTestId('receipt-status').first()).toHaveText('Processed', { timeout: 5000 })
  expect(callCount).toBe(2)
})

test('repeats the parse-and-wait loop if the auto-retry itself hits another 429', async ({ page }) => {
  let callCount = 0
  await page.route('**/api/extract-receipt', (route) => {
    callCount += 1
    if (callCount <= 2) {
      return route.fulfill({ status: 429, contentType: 'application/json', body: rateLimitError(1) })
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [{ name: 'Eggs', price: 4.2, category: 'dairy' }] }),
    })
  })

  await page.goto('/')
  await captureReceipt(page)
  await page.getByTestId('receipt-process-button').click()

  await expect(page.getByTestId('receipt-status').first()).toHaveText(/Retrying in \d+s/)
  // still retrying (not given up) after the first auto-retry fails again
  await expect(page.getByTestId('receipt-status').first()).toHaveText(/Retrying in \d+s/, { timeout: 3000 })

  await expect(page.getByTestId('receipt-status').first()).toHaveText('Processed', { timeout: 5000 })
  expect(callCount).toBe(3)
})

test('manual Retry works immediately and bypasses the countdown', async ({ page }) => {
  let callCount = 0
  await page.route('**/api/extract-receipt', (route) => {
    callCount += 1
    if (callCount === 1) {
      return route.fulfill({ status: 429, contentType: 'application/json', body: rateLimitError(30) })
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [{ name: 'Bread', price: 2.49, category: 'bakery' }] }),
    })
  })

  await page.goto('/')
  await captureReceipt(page)
  await page.getByTestId('receipt-process-button').click()

  await expect(page.getByTestId('receipt-status').first()).toHaveText(/Retrying in \d+s/)

  await page.getByTestId('receipt-process-button').click()

  // succeeds well within the (unwaited) 30s window, proving manual retry bypassed it
  await expect(page.getByTestId('receipt-status').first()).toHaveText('Processed', { timeout: 5000 })
  expect(callCount).toBe(2)
})

test('an unrecognized 429 message falls back to manual-retry-only, no countdown', async ({ page }) => {
  await page.route('**/api/extract-receipt', (route) =>
    route.fulfill({
      status: 429,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'OpenAI returned 429: rate limited, please slow down' }),
    }),
  )

  await page.goto('/')
  await captureReceipt(page)
  await page.getByTestId('receipt-process-button').click()

  await expect(page.getByTestId('receipt-status').first()).toHaveText('Failed — will retry')

  // give it time to prove no auto-retry ever fires without a parsed wait
  await page.waitForTimeout(1500)
  await expect(page.getByTestId('receipt-status').first()).toHaveText('Failed — will retry')
  await expect(page.getByTestId('receipt-process-button')).toHaveText('Retry')
})

test('an OpenAI token-limit 429 (request too large) shows a distinct message with no retry countdown', async ({
  page,
}) => {
  let callCount = 0
  await page.route('**/api/extract-receipt', (route) => {
    callCount += 1
    return route.fulfill({ status: 429, contentType: 'application/json', body: tokenLimitError() })
  })

  await page.goto('/')
  await captureReceipt(page)
  await page.getByTestId('receipt-process-button').click()

  // distinct, non-retryable message — not the generic "too many requests" one
  await expect(page.getByTestId('receipt-error')).toHaveText(
    'Receipt image too large for current plan — try a clearer/smaller photo',
  )
  await expect(page.getByTestId('receipt-status').first()).toHaveText('Failed — will retry')
  await expect(page.getByTestId('receipt-status').first()).not.toHaveText(/Retrying in \d+s/)
  await expect(page.getByTestId('receipt-process-button')).toHaveText('Retry')

  // no scheduled retry ever fires, unlike an ordinary parsed-wait 429 above
  await page.waitForTimeout(1500)
  await expect(page.getByTestId('receipt-status').first()).toHaveText('Failed — will retry')
  expect(callCount).toBe(1)
})

test('a truncated OpenAI response (finish_reason: "length") shows a distinct "too many items" message', async ({
  page,
}) => {
  let callCount = 0
  await page.route('**/api/extract-receipt', (route) => {
    callCount += 1
    return route.fulfill({ status: 502, contentType: 'application/json', body: truncatedResponseError() })
  })

  await page.goto('/')
  await captureReceipt(page)
  await page.getByTestId('receipt-process-button').click()

  // distinct "too many items" message — not the generic parse-failure one,
  // even though the raw message also contains "JSON"-shaped text
  await expect(page.getByTestId('receipt-error')).toHaveText(
    'Receipt has too many items to process at once — try splitting it into two photos',
  )
  await expect(page.getByTestId('receipt-status').first()).toHaveText('Failed — will retry')
  await expect(page.getByTestId('receipt-status').first()).not.toHaveText(/Retrying in \d+s/)
  await expect(page.getByTestId('receipt-process-button')).toHaveText('Retry')

  // no scheduled retry ever fires — same image would just get truncated again
  await page.waitForTimeout(1500)
  await expect(page.getByTestId('receipt-status').first()).toHaveText('Failed — will retry')
  expect(callCount).toBe(1)
})
