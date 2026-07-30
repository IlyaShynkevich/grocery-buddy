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

**M7 (history) / M8 (monthly stats)**: not yet started. Note: M6 already
delivered a basic history list + read-only trip detail view, so M7's
actual remaining scope (what it adds beyond what M6 already built) needs
to be clarified before starting it.

## Known issues

- **DB Debug Panel "Reset all data"** leaves 1-2 phantom trips behind after
  reload instead of zero. Not yet fixed.

## Known follow-ups

- **Discount/coupon entries displayed as regular items in the DB Debug
  Panel.** Discount/coupon entries (from receipt extraction) currently
  display in the DB Debug Panel as if they were regular items — with a
  category dropdown and essential/non-essential toggle — when they're
  really internal accounting entries, not purchased products. This is
  currently harmless since the debug panel is temporary, but must be
  addressed before M8 (monthly stats), since discount entries should never
  count as category spending (e.g. shouldn't inflate "Others" or any
  category's essential/non-essential totals). Fix by either tagging
  discount entries with a distinct type that stats/UI code explicitly
  excludes, or filtering them out of any item-list/category display
  entirely.

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
