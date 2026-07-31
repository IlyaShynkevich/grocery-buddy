# Grocery Buddy

Personal, mobile-first grocery budget tracker, built as an installable PWA.
Single-user, no auth. See
[`DOCS/grocery-buddy-spec.md`](DOCS/grocery-buddy-spec.md) for the original
concept spec and data model.

## What it does

- **Shopping list** — build a running list as you shop, item by item.
- **Receipt scanning** — snap a photo with the camera or pick an existing
  one from your photo library at checkout; a Groq vision model extracts line
  items, prices, and a suggested category directly from the receipt.
- **Review & reconcile** — after a scan, a review panel lets you fix or drop
  a misread line, and auto-suggests merges between typed items and their
  scanned counterpart (e.g. a typed "Milk" matched against a scanned "Milch
  1L") so you don't end up with duplicates.
- **Offline-first** — the shopping list and receipt capture both work with
  no connection. A receipt taken offline goes into a visible pending queue
  and is automatically sent for extraction once you're back online, with no
  action needed.
- **Trip history** — completed trips are saved and grouped by month, most
  recent first; the month label sticks to the top of the list as you scroll
  and swaps to the next month automatically, and the list scrolls
  internally (about 9 trips visible at once) instead of growing the page.
  Each trip has a read-only detail view (items, prices, essential/
  non-essential status, discounts, total).
- **Monthly stats** — total spend, an essential vs. non-essential split, and
  spend broken down by category, for any month with completed trips.
- **Mascot** — a small hand-drawn companion on the Shopping List page shows
  what's going on: idle normally, scanning while a receipt is being
  processed, and happy once results are ready to review.
- **Tab navigation** — Shopping List, History, and Stats are reachable from
  the tab bar or by swiping left/right between them, with a slide
  transition either way.
- **Installable PWA** — add to your phone's home screen for offline-capable,
  app-like use; no app store involved.

## Stack

React + Vite + TypeScript, installable as a PWA (service worker via
`vite-plugin-pwa`), IndexedDB (via Dexie) for local-first storage, and Groq
(a vision-capable model) for receipt extraction through a Vercel serverless
function (`api/extract-receipt.ts`). Deployed on Vercel — pushes to `main`
go to production, other branches/PRs get their own preview deployment.

Plain React + inline styles throughout; no CSS framework or UI component
library.

## Development

```bash
npm install
npm run dev
```

`npm run dev` does **not** include the service worker or offline behavior —
those only build in production. See [Testing](#testing) below for how to
exercise them locally.

A **DB Debug Panel** (dev-only, collapsed by default) is available on the
Shopping List tab for inspecting and mutating the Dexie data directly —
create/reset trips, edit item categories, toggle essential overrides, pin
an arbitrary trip as "active." It's hidden on History and Stats.

## Environment variables

`GROQ_API_KEY` is required for receipt extraction (see
`api/extract-receipt.ts`). It needs to be set in **two separate places** —
they don't share values:

- **Local dev**: copy `.env.example` to `.env.local` and fill in the key.
  `.env.local` is gitignored and only affects your machine.
- **Deployed (Vercel)**: add `GROQ_API_KEY` in the Vercel dashboard under
  **Project → Settings → Environment Variables** (set it for both
  Production and Preview). Vercel does **not** read `.env.local` — if the
  key is only in `.env.local`, the deployed app's serverless function will
  fail with an auth error even though local dev works fine.

## Testing

```bash
npm run test:e2e
```

Playwright end-to-end tests live in `e2e/` (config in
`playwright.config.ts`) and cover the shopping list, receipt capture/queue,
Groq extraction, review/merge, offline sync, trip history, and monthly
stats. They run against the **production build** (`npm run preview`, started
automatically by the test runner), not `npm run dev` — the service worker
and offline behavior these flows depend on don't exist in dev mode.

## Build

```bash
npm run build    # typecheck (tsc -b) + production build
npm run preview  # serve the production build locally
npm run lint     # oxlint
```
