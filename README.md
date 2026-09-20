# Grocery Buddy

Personal, mobile-first grocery budget tracker, built as an installable PWA.
Single-user, gated behind one shared password on the Production deployment
(the public demo below stays open).

- [`DOCS/grocery-buddy-spec.md`](DOCS/grocery-buddy-spec.md) — the original
  concept spec and data model.
- [`DOCS/ARCHITECTURE.md`](DOCS/ARCHITECTURE.md) — how it actually works
  now, by topic: data model, extraction flow, PWA/offline, navigation,
  settings and theming, deployment.
- [`DOCS/CHANGELOG.md`](DOCS/CHANGELOG.md) — every milestone and
  post-deploy fix, in order.

## Live Demo

[grocery-buddy-demo.vercel.app](https://grocery-buddy-demo.vercel.app/)

Receipt scanning is disabled in this public demo (no `OPENAI_API_KEY`
configured there) — it shows a friendly "demo mode" message instead of
running the AI extraction. Everything else (shopping list, trip history,
monthly stats, settings, backup, Customize) works completely normally. Run it yourself with
your own `OPENAI_API_KEY` (see [Environment
variables](#environment-variables)) to get full functionality, including
receipt scanning.

## What it does

- **Shopping list** — build a running list as you shop, item by item,
  checking each one off as you grab it. It's purely your own typed notes
  plus whatever you've explicitly confirmed from a scan (see below) — a
  scan never lands on the list on its own.
- **Receipt scanning** — snap a photo with the camera or pick an existing
  one from your photo library at checkout; an OpenAI vision model extracts
  line items, prices, a suggested category, and the receipt's own purchase
  date directly from the receipt. German, Russian and Belarusian receipts
  are all handled. Photos are shrunk on capture and deleted once the trip
  is saved, so scanning doesn't quietly fill up your phone.
- **Staged review, nothing added until you confirm** — after a scan, a
  collapsed summary (total + Confirm) appears without pushing the rest of
  the page out of view; expanding it shows the full item list with editable
  prices, and auto-suggested merges between a typed item and its scanned
  counterpart (e.g. typed "Milk" matched against scanned "Milch 1L") so you
  don't end up with duplicates. None of it touches your shopping list until
  you tap Confirm — dismissing the review, or deleting the receipt photo,
  discards the scan as if it never happened.
- **Personalized category notes** — on the Customize page (Settings →
  Customize categories), jot down specific items you personally treat as an
  exception within a category (e.g. under Frozen: "nuggets, frozen pizza"). These feed into the receipt-scanning
  prompt, so a matching item on a future scan gets flagged non-essential
  automatically instead of just inheriting its category's usual default.
- **Offline-first** — the shopping list and receipt capture both work with
  no connection. A receipt taken offline goes into a visible pending queue
  and is automatically sent for extraction once you're back online, with no
  action needed.
- **Trip history** — completed trips are saved and grouped by month, most
  recent first; the month label sticks to the top of the list as you scroll
  and swaps to the next month automatically, and the list scrolls
  internally (about 11 trips visible at once) instead of growing the page.
  Each trip has a detail view (items, prices, essential/non-essential
  status, discounts, total) that's otherwise read-only, aside from two
  intentional exceptions: toggling an item's essential/non-essential badge,
  and cleaning up a leftover unmatched item — tap one for an inline
  delete confirm, or long-press to multi-select several and delete them
  together.
- **Backup & restore** — from Settings, export your entire history to a
  JSON file anytime, and restore it (on this device or a new one) with an
  explicit confirm step first. The only way your data survives clearing
  site data, uninstalling, or switching phones, since everything lives
  client-side with no server-side copy. Settings also shows how much space
  the app is using on the device, broken down by receipt photos, trip data
  and app files.
- **Settings** — pick your language and currency independently, and a
  light / dark / same-as-device theme. Currency applies to new trips only,
  so changing it never relabels what you already recorded.
- **English and Russian** — the whole interface, including the login page,
  with proper plurals and month names in both.
- **Monthly stats** — total spend, an essential vs. non-essential split, and
  spend broken down by category, for any month with completed trips.
- **Mascot** — a small hand-drawn companion shows what's going on: idle
  normally, scanning while a receipt is being processed, and happy once
  results are ready to review — also the visual anchor on the Home and
  About pages, where it has a gentle idle hop (disabled if your device asks
  for reduced motion).
- **Home page** — a mascot-led welcome screen with a friendly "I'm ready to
  shop" button into the shopping list, shown automatically on a genuinely
  fresh app open. A same-session reload instead restores whichever tab you
  were last on, and is never bounced back to Home.
- **Tab navigation** — Shopping List, History, Stats, and Settings are
  reachable from the tab bar or by swiping left/right between them, with a
  slide transition either way. Home and About sit outside that swipeable
  set, reached only via their corner icons; Customize and trip detail are
  sub-pages, opened from Settings and History respectively.
- **About page** — app name, version, a quick rundown of what the app does,
  credit, and what's planned next, reachable from the top-right info icon.
- **Installable PWA** — add to your phone's home screen for offline-capable,
  app-like use; no app store involved.

## Stack

React + Vite + TypeScript, installable as a PWA (service worker via
`vite-plugin-pwa`), IndexedDB (via Dexie) for local-first storage, and
OpenAI's `gpt-4.1-mini` (vision-capable) for receipt extraction through a
Vercel serverless function (`api/extract-receipt.ts`). Deployed on Vercel —
pushes to `main` go to production, other branches/PRs get their own preview
deployment.

Plain React + inline styles throughout; no CSS framework or UI component
library. Sizes, spacing, radii and colours all come from a small token set
in `src/index.css`, re-exported as ready-made style objects from
`src/lib/ui.ts` — see `CLAUDE.md`'s design-system section.

## Development

```bash
npm install
npm run dev
```

`npm run dev` does **not** include the service worker or offline behavior —
those only build in production. See [Testing](#testing) below for how to
exercise them locally.

A **DB Debug Panel** is available on the Shopping List tab for inspecting
and mutating the Dexie data directly — create/reset trips, edit item
categories, toggle essential overrides, pin an arbitrary trip as "active."
It is hidden by default everywhere, including in production, and is
switched on for the current session by three quick taps on the Home mascot
(tapping three times again hides it; a toast confirms either way). It
renders only on Shopping List, and only its header until you expand it —
rendering its contents while collapsed used to be almost all of that tab's
lag.

## Environment variables

`OPENAI_API_KEY` is required for receipt extraction (see
`api/extract-receipt.ts`). It needs to be set in **two separate places** —
they don't share values:

- **Local dev**: copy `.env.example` to `.env.local` and fill in the key.
  `.env.local` is gitignored and only affects your machine.
- **Deployed (Vercel)**: add `OPENAI_API_KEY` in the Vercel dashboard under
  **Project → Settings → Environment Variables** (set it for both
  Production and Preview). Vercel does **not** read `.env.local` — if the
  key is only in `.env.local`, the deployed app's serverless function will
  fail with an auth error even though local dev works fine.

`APP_PASSWORD` gates access to the whole app (a Vercel Edge Middleware —
`middleware.ts` — checks it on every request, including
`api/extract-receipt.ts`, before anything else runs). Same two-places
framing as `OPENAI_API_KEY`, plus one more wrinkle:

- Set it in the Vercel dashboard the same way, but **only on the
  Production project** — leave it unset on the Demo project
  (`grocery-buddy-demo`), which is what keeps Demo publicly open. Setting
  it there too would gate the public showcase, defeating its purpose.
- If unset entirely (e.g. local dev, or Demo), `middleware.ts` is a
  complete no-op — same "absent env var turns the feature off" convention
  `OPENAI_API_KEY`'s demo-mode branch already uses, so local dev never
  needs a password to work with.

## Testing

```bash
npm run test:e2e
```

Playwright end-to-end tests live in `e2e/` (config in
`playwright.config.ts`) and cover the shopping list, receipt capture/queue,
OpenAI extraction, review/merge, offline sync, trip history, monthly stats,
backup/restore, storage figures, settings (language, currency, theme), the
Russian translation, and a one-screen layout check that runs every page at
a real phone viewport in both languages. They run against the **production build** (`npm run preview`, started
automatically by the test runner), not `npm run dev` — the service worker
and offline behavior these flows depend on don't exist in dev mode.

## Build

```bash
npm run build    # typecheck (tsc -b) + production build
npm run preview  # serve the production build locally
npm run lint     # oxlint
```
