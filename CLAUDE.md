# Grocery Buddy

Personal, mobile-first grocery budget tracker (PWA). See
`DOCS/grocery-buddy-spec.md` for the full concept, v1/v2 scope, and data
model.

## Status

- **M0–M3**: done (project scaffold, Dexie schema, typed shopping list,
  receipt photo capture + offline pending queue).
- **M4 (Groq receipt extraction)**: done and verified in production.
  Getting here also required fixing several bugs found post-deploy:
  - A broken relative import path that broke the deployed serverless
    function — Vercel's Node builder renames traced `.ts` files to `.js`
    without rewriting import specifiers, so relative imports under `api/`
    must use `.js` extensions, not `.ts`.
  - Groq output truncation on receipts with many line items — raised
    `max_completion_tokens` to 4096.
  - Prices were hardcoded to USD (`$`) — now formatted via the shared
    `src/lib/formatPrice.ts` (German/EUR locale, comma decimals).
  - Groq 429 rate limits now auto-retry with a parsed countdown ("retrying
    in Xs"), falling back to manual-retry-only if the error message doesn't
    match the expected format.
- **M5 (auto-sync + receipt review/merge)**: done and verified in
  production.
  - Part 1: pending receipts auto-process on reconnect (`online` listener),
    one at a time, reusing the same extraction/retry logic as manual
    processing. A stranded `processing` receipt (tab closed/reloaded
    mid-extraction) is reclaimed back to `pending` on next load rather than
    getting stuck forever.
  - Part 2: a non-blocking review/merge panel shown after extraction —
    lets the user edit/remove scanned items and, if the trip already had
    typed items, confirm or reject best-effort fuzzy-matched duplicates
    (`src/lib/itemMatch.ts`) before they'd otherwise sit as separate
    entries. Ignoring the panel loses nothing — items are already added;
    review is a reconciliation step, not a gate.
- **M6 (save trip / history)**: done and verified in production. "Save
  trip" marks the active trip complete and auto-starts a new empty draft;
  a basic History list (date, item count, total; sorted by completion time)
  and a read-only trip detail view were built as part of this. Trip dates
  display in German `DD.MM.YYYY` format throughout.
- **M7 (history improvements)**: done and verified in production.
  - Trip detail now shows each item's resolved essential/non-essential
    status (category default unless overridden — `resolveEssential` in
    `src/db/categories.ts`, the same logic the DB Debug Panel already used)
    as a small badge next to name/price.
  - History is grouped by calendar month of the trip's shopping date, most
    recent month first, trips within a month most-recently-completed first
    (`groupTripsByMonth` in `src/features/history/useHistory.ts`); a month
    dropdown (shown once there's more than one month) filters the list down
    to a single month.
  - Fixed the discount/coupon display issue below: discount lines now
    render as a distinct deduction row (no category or essential control)
    everywhere they're shown, instead of only being filtered out of some
    views and displayed as a regular item in others.

- **M8 (monthly stats)**: done and merged to production. A new Stats section
  reuses M7's `groupTripsByMonth` for its month selector; for the selected
  month it computes total spend (sum of each trip's already-net `total`,
  same convention as History/trip detail), an essential vs. non-essential
  split, and spend per category, via `resolveEssential`
  (`src/features/stats/useMonthlyStats.ts`). Two plain inline-styled bar
  visualizations (category breakdown, essential/non-essential split) — no
  charting library added, consistent with the rest of the app. A month with
  no completed trips (including "no trips at all yet") shows an empty state
  instead of an empty chart.
  - Post-deploy fix: Essential + Non-essential didn't sum to the displayed
    Total (off by the month's total discount amount) — discounts were
    excluded from both the essential and category breakdowns entirely while
    still netting out of Total, so the two didn't reconcile. Fixed by
    folding each discount's (negative) amount into its own recorded
    category and resolved essential status, same as any other item, rather
    than skipping it. Discount/coupon lines have no reliable link back to
    which purchased item they discounted — the receipt extraction prompt
    just tags every discount with category "other" (see
    `api/_lib/groqExtract.ts`) — so guessing a distribution across
    categories wasn't an option; in practice this means discounts land
    under "Other" (essential by default), reducing the essential total.
- **Delete trip + debug panel collapsed by default**: done and merged to
  production.
  - Trip detail has a "Delete trip" action (`deleteTrip` in `src/db/db.ts`),
    gated behind an inline confirm/cancel step since it's destructive and
    irreversible. Deletes the trip's items and any pending receipts still
    pointing at it along with the trip row itself. If the deleted trip is
    the one the active-trip pointer refers to (normally only possible for a
    draft, but the debug panel's "Make active" can point it at a completed
    trip too), a fresh empty draft is created and pinned active in its
    place — same idea as `completeTrip`.
  - The DB Debug Panel is now a collapsed-by-default `<details>`/`<summary>`
    ("Debug tools ▸") instead of always-visible — it's a dev tool, not part
    of the real app. Its contents stay in the DOM either way (just not
    rendered until opened), so e2e tests only need to click
    `debug-panel-toggle` once before interacting with anything inside.
- **Frontend design pass**: implemented, not yet merged/deployed. Checked
  the available skills first (`ui-styling`, `design-system`) — both assume a
  Tailwind/shadcn stack, which this project deliberately doesn't use (plain
  React + inline styles, zero UI dependencies), so pulling either in would
  have been a stack change, not a styling pass. Instead applied the same
  primitive→semantic token idea natively:
  - `src/index.css` now defines the actual design tokens (light + dark, via
    `prefers-color-scheme`) as CSS custom properties: `--bg`/`--surface`,
    `--border`/`--border-strong`, `--text`/`--text-muted`, `--accent`,
    `--danger`, plus `--radius`/`--radius-sm`. The dark `--bg` (`#16171d`)
    is unchanged from before this pass — only the accent/border language
    around it changed. Also adds base styling for `button`/`input`/`select`
    (padding, radius, hover/active/disabled, `:focus-visible` ring) so
    every page gets consistent form-control styling without repeating it.
  - `src/lib/ui.ts` holds shared style-object building blocks (`pageStyle`,
    `cardStyle`, `mutedTextStyle`, `primaryButtonStyle`,
    `dangerButtonStyle`/`dangerFilledButtonStyle`) so pages compose from the
    same tokens instead of hand-rolling similar-but-slightly-different
    inline styles.
  - The green accent (`#2e7d32`, used for the PWA theme-color, button/panel
    borders, and — since it turned out to be the same literal color — the
    "essential" badges/bars too) is gone everywhere, replaced by shade/
    weight differences within the gray palette (e.g. essential = solid
    `--accent` fill, non-essential = outlined/muted; category bars all one
    consistent accent color, differentiated by length/label like a real
    chart rather than by hue). `index.html` now sets light/dark
    `theme-color` via media-query'd `<meta>` tags; the PWA manifest
    (`vite.config.ts`, single static value, no media-query support) uses the
    dark background color since dark is the primary theme.
  - Destructive/error red (delete trip, receipt error text) was deliberately
    kept — that's a semantic safety convention, not "the accent," and the
    dark-mode danger red was also swapped to a lighter shade
    (`#c62828` → `#f28b82` in dark) for adequate contrast against the near-
    black background, which the original hardcoded red didn't have.
  - List rows (shopping list, receipts, history, trip detail) moved from
    plain border-bottom dividers to individual rounded `--surface` cards
    with gaps between them; the nav bar now highlights the active tab.
    No behavior changes — verified via the full Playwright suite (still
    passing) plus a manual pass through Shopping List, History, Trip
    Detail, and Stats in a real browser.
- **App name consistency + placeholder icon**: implemented, not yet merged/
  deployed.
  - The PWA manifest's `short_name` was still `"Groceries"` (used for
    home-screen/task-switcher labels) while `index.html`'s `<title>` and the
    manifest's `name` already said "Grocery Buddy" — now all three agree.
  - Replaced the placeholder app icons (`public/favicon.svg`,
    `public/icons/icon-192.png`, `icon-512.png`, `apple-touch-icon.png`),
    which were flat green squares/an unrelated purple graphic left over from
    scaffolding, with a simple hand-drawn gray-toned shopping-bag glyph
    matching the app's actual dark `--surface`/`--accent` tokens (`#1e1f27`
    bg, `#a1a1aa` glyph) — consistent across every icon touchpoint now. The
    PNGs were generated via a one-off PowerShell/`System.Drawing` script
    (no new dependency added); the SVG favicon is hand-written to match the
    same coordinates. This is still a placeholder — swap for real mascot
    artwork once it's ready.

## Known issues

- **DB Debug Panel "Reset all data"** leaves 1-2 phantom trips behind after
  reload instead of zero. Not yet fixed.

## Known limitations

- **Receipt-review item matching is not translation-aware.** The matching in
  `src/lib/itemMatch.ts` compares text similarity only. Typed items in
  English will only match German receipt text when the words happen to look
  similar as text (e.g. "tomato" matches "Tomaten", but "eggs" does not
  match "Eier"). This is a known, acceptable limitation for now — unmatched
  items just appear as separate entries and can be manually
  removed/reconciled. Revisit only if this becomes a real usability problem
  in practice.

## Commands

- `npm run dev` — dev server (no service worker; PWA/offline features only
  build in production)
- `npm run build` — typecheck (`tsc -b`) + production build
- `npm run preview` — serve the production build locally (use this, not
  `dev`, to test anything offline/PWA-related)
- `npm run lint` — oxlint
- `npm run test:e2e` — Playwright E2E suite (`e2e/`)

## Git workflow

Claude does not run `git add`/`commit`/`push`/branch/merge commands in this
repo. For each milestone or fix, Claude gives the exact branch name and
commit message(s); the user creates the branch, commits, pushes, and merges
themselves. This keeps GitHub history under the user's own authorship.

Every commit message Claude gives — milestone or fix, no exceptions — must
be a short title line plus a brief description (2-4 lines) explaining what
changed and why. Never just a one-line title.

Vercel auto-deploys: pushes to `main` trigger a Production deploy; pushes to
any other branch (or open PR) get an automatic Preview deployment with its
own URL — useful for testing a milestone branch before merging.

Before stating whether a branch is merged, or making any other claim about
git state (what's on `origin/main`, whether a PR landed, what's currently
deployed), always run `git fetch origin` then `git log origin/main --oneline`
to verify first — never assume from local context or something established
earlier in the session. This has been wrong multiple times this session.

## Testing

Playwright E2E tests (`e2e/`, config in `playwright.config.ts`) are a
standard part of the workflow going forward, not a one-off — write or
extend them for future milestones where meaningful, not just when chasing a
specific bug.

This matters especially for **M3–M5** (receipt photo capture, offline
pending-receipt queue, Groq extraction, auto-sync/review merge): these are
multi-step, stateful flows — the kind that are easy to break silently
without an automated repro. Prefer catching that with a test over relying
on manual re-testing alone.

Tests run against the production build (`npm run preview`), not `npm run
dev` — the service worker and offline behavior that these flows depend on
don't exist in dev mode.
