# Grocery Buddy

Personal, mobile-first grocery budget tracker (PWA). See
`DOCS/grocery-buddy-spec.md` for the full concept, v1/v2 scope, and data
model.

## Status

All milestones below are done and verified in production. Full
milestone-by-milestone and fix-by-fix history (including every post-deploy
bug found and fixed along the way) lives in `DOCS/CHANGELOG.md` — this
section is just a short index into it.

- **M0–M3**: project scaffold, Dexie schema, typed shopping list, receipt
  photo capture + offline pending queue.
- **M4**: Groq receipt extraction (photo → line items).
- **M5**: auto-sync of pending receipts on reconnect + a review/merge panel
  for scanned items.
- **M6**: save trip / history (trip completion, History list, trip detail
  view).
- **M7**: history improvements (essential/non-essential badges, grouping by
  month with a filter).
- **M8**: monthly stats (spend totals, essential/non-essential split,
  per-category breakdown).
- Numerous post-M8 polish/fix passes: grayscale design pass, app icon/mascot
  artwork, footer/layout fixes, swipe navigation + tab-slide animation,
  history's internally-scrollable trip list with a sticky month header, and
  several Groq extraction reliability fixes (429 handling, retry-backoff
  races, output-token truncation).

See "Known limitations" and "Planned" below for what's still outstanding.
For the full narrative — what broke, how it was diagnosed, and exactly what
changed — see `DOCS/CHANGELOG.md`.

## Known limitations

- **Receipt-review item matching is not translation-aware.** The matching in
  `src/lib/itemMatch.ts` compares text similarity only. Typed items in
  English will only match German receipt text when the words happen to look
  similar as text (e.g. "tomato" matches "Tomaten", but "eggs" does not
  match "Eier"). This is a known, acceptable limitation for now — unmatched
  items just appear as separate entries and can be manually
  removed/reconciled. Revisit only if this becomes a real usability problem
  in practice.

## Planned (not started)

- **Auto-scroll to top after confirming/dismissing a receipt review.**
  Right now the user has to manually scroll up to reach Save trip after a
  review resolves.

## Known gotchas

- **Double-check exact env var names before anything else, when a "server
  not configured with X" error persists despite everything else looking
  right.** A Vercel env var typo (`OPEN_API_KEY` instead of
  `OPENAI_API_KEY`) once caused a long, confusing debugging session where
  the code, `.env.local`, and every other layer looked correct — the typo
  was the only thing wrong.
- **A working deploy can look completely broken (blank/solid color) on a
  real phone from stale PWA/service-worker caching**, even when the same
  URL works fine on desktop or in emulation. Always test in an
  incognito/private tab first to rule out caching before assuming the code
  is broken.

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
follow this format: a short title line, a brief 1-2 sentence summary of
what changed and why, then bullet points listing each specific change.
Never just a one-line title, and never a dense prose paragraph in place of
the bullets — the goal is something quickly skimmable when reviewing past
work later. For example:

```
Fix stale trip date and one-way shopping list toggle

The active draft's date wasn't refreshing on load, and the collapse
toggle couldn't be tapped back closed once expanded.

- Refresh a draft trip's date to today on load, not just at creation
- Always render the shopping list toggle so it works both directions
- Add e2e coverage for both fixes
```

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
