# Grocery Buddy — Architecture

A structural reference to how the app actually works, organized by topic —
not by when things were built. For *what* the app is meant to do and the
original v1/v2 scope, see
[`DOCS/grocery-buddy-spec.md`](grocery-buddy-spec.md). For the
chronological history of every milestone and post-deploy fix, see
[`DOCS/CHANGELOG.md`](CHANGELOG.md). `CLAUDE.md` has the project's working
conventions (git workflow, commit format, testing policy).

## 1. Architecture overview

Three pieces, two of which never talk to each other directly:

```
┌─────────────────────────────┐        ┌──────────────────────────┐        ┌─────────────┐
│  Browser (React + Vite SPA) │  HTTPS │  Vercel serverless fn     │  HTTPS │  OpenAI API │
│  ┌────────────────────────┐ │ POST   │  api/extract-receipt.ts  │        │             │
│  │ Dexie / IndexedDB       │◄┼───────►│  (holds OPENAI_API_KEY,  ├───────►│ gpt-4.1-mini│
│  │ (all app data, local)   │ │ image  │   thin proxy + parsing)  │        │  (vision)   │
│  └────────────────────────┘ │ +notes │                          │        │             │
└─────────────────────────────┘        └──────────────────────────┘        └─────────────┘
```

- **The frontend is the whole app.** Shopping list, history, stats, and
  customize notes are pure client-side Dexie reads/writes — no network
  call, no server round-trip, ever. This is why they "work completely
  normally" even when the app has no `OPENAI_API_KEY` at all (demo mode,
  §3/§4/§8) — those features never depended on the server in the first
  place.
- **Server-side code is two small functions plus one middleware.**
  `api/extract-receipt.ts` exists purely to keep the OpenAI API key off the
  client (a browser can't hold a secret); `api/_lib/openaiExtract.ts` is
  the actual OpenAI client + response parser it imports. `api/login.ts`
  verifies the shared app password and issues a signed session cookie.
  `middleware.ts` (Vercel Edge Middleware, §8) gates every request —
  including both functions above — behind that cookie. None of these hold
  any persistence of their own: every request is stateless in, JSON/cookie
  out.
- **No accounts, no sync, no server database.** Single-user by design (see
  the spec) — everything durable lives in the browser's IndexedDB via
  Dexie. Reinstalling the PWA or clearing site data loses everything;
  there's no backup/export path today.
- **Deployment is Vercel-native**: the React app is a static build served
  by Vercel's CDN, `api/*.ts` files become individual serverless functions
  automatically (no separate backend to deploy or scale).

## 2. Data model

Dexie schema lives entirely in [`src/db/db.ts`](../src/db/db.ts), versioned
via `db.version(n).stores(...)` calls — adding a field to an existing table
is free (Dexie doesn't enforce a schema on the value shape, only on what's
indexed), but adding a new table or a new *indexed* field needs a new
`db.version()` bump, or existing installs won't pick it up.

| Table | Key fields | Purpose |
|---|---|---|
| `trips` | `id`, `date`, `status` (`draft`\|`complete`), `total`, `completedAt` | One row per shopping trip. Exactly one `draft` trip is ever "active" at a time. |
| `items` | `id`, `tripId`, `name`, `price`, `category`, `essentialOverride`, `source` (`typed`\|`ai`\|`manual`), `isDiscount` | Line items, typed or AI-extracted, belonging to a trip. |
| `pendingReceipts` | `id`, `tripId`, `imageBlob`, `status` (`pending`\|`processing`\|`failed`\|`done`), `lastError`, `retryAt`, `addedItemIds`, `suggestedMatches`, `reviewed` | The offline-capable receipt queue — see §3. |
| `appState` | `key`, `value` | Single-row-per-key pointer table; today only holds `activeTripId`. |
| `categoryNotes` | `id`, `categoryKey`, `text` | Freeform personal notes per category, written on Customize — see §3/§4. |

**Active trip identity is a persisted pointer, not a heuristic.** `items`
and `pendingReceipts` attach to "the active trip" via
`getOrCreateActiveTrip()`/`useActiveTripId()`, which read `appState`'s
`activeTripId` row — deliberately *not* "whichever draft trip is newest."
An earlier version used that heuristic and it silently hijacked the active
trip whenever a second code path (the DB Debug Panel) created its own draft
concurrently. The pointer, plus a `pendingActiveTripCreation` promise guard
against a create-race on first load, is what closes that. See the doc
comments directly above `getOrCreateActiveTrip` in `db.ts` for the full
race.

**Essential/non-essential resolution** ([`src/db/categories.ts`](../src/db/categories.ts)):
`CATEGORIES` is a static in-code array (not a DB table) — 11 fixed
categories, each with its own default `essential: boolean` (e.g. Produce is
essential by default, Snacks/Drinks aren't). An item's *effective* status
is:

```ts
resolveEssential(item) = item.essentialOverride ?? isEssentialByDefault(item.category)
```

`essentialOverride` is `null` (inherit the category default) unless
something set it explicitly — and critically, **when set, it's the item's
literal resulting status, not a delta/flip relative to the category
default.** Every writer of this field (the manual toggle in
`DbDebugPanel.tsx`, and the AI extraction path — see §3/§4) has to respect
that literal semantics. This was the exact site of a real bug: an earlier
prompt told the model to set `essentialOverride` to "the opposite of the
category's default," which the model didn't reliably compute, producing
wrong results for categories whose default was itself non-essential. The
fix (and a comment on `resolveEssential` itself) replaced that with a
literal, direction-independent instruction — see `DOCS/CHANGELOG.md` for
the incident, `categories.ts`'s doc comment for the standing rule.

**Discounts and stats reconciliation**: a discount/coupon line has no
reliable link back to which purchased item it discounted (the extraction
prompt just tags every discount `category: "other"`). Rather than guess a
distribution, `useMonthlyStats` folds each discount's negative amount into
its own recorded category and resolved essential status like any other
item — in practice landing under "Other" (essential by default), reducing
the essential total. This keeps the essential/non-essential split and the
per-category breakdown both exactly reconciled with the trip total; not
doing this was a real production bug.

## 3. Receipt extraction flow, end to end

1. **Typed items** — `ShoppingListPage` writes `Item` rows directly
   (`source: 'typed'`) to the active trip. No network involved.
2. **Photo capture** — `ReceiptCapture.tsx`'s camera/gallery `<input>`s
   (two separate inputs, since `capture="environment"` has to be present
   at trigger time to reliably force the native camera app open, and
   toggling it on one shared input is flaky on mobile Safari) feed
   `captureReceipt()` in `useReceiptCapture.ts`, which adds a
   `PendingReceipt` (`status: 'pending'`) with the photo stored as a `Blob`
   **directly in IndexedDB** — no upload happens yet. This is what makes
   capture itself fully offline-capable (§5).
3. **Processing trigger** — three independent triggers all funnel into the
   same `processReceipt()`: a manual Process/Retry click, `ReceiptRow`'s
   own per-row `setTimeout` (scheduled from a parsed rate-limit wait, see
   §4), and a sweep on the browser's `online` event. All three can race to
   pick up the same eligible receipt; `claimReceiptForProcessing()` in
   `db.ts` closes that with an atomic Dexie read-then-write transaction
   (IndexedDB serializes overlapping `readwrite` transactions on the same
   store — a platform guarantee, not a Dexie trick), so only one ever
   proceeds to the actual API call. This was written after a real incident:
   a flaky-connectivity session produced 6+ rapid-fire 429s for one receipt
   in under 40 seconds.
4. **Request** — `getCategoryNoteHints()` (`db.ts`) reads all
   `categoryNotes` grouped by category. `extractReceiptItems()`
   (`extractReceipt.ts`, frontend) resizes/re-encodes the photo client-side
   via `<canvas>` (max 1600px edge, JPEG quality 0.8) — phone photos plus
   base64's ~37% size overhead can otherwise exceed Vercel's 4.5MB function
   body limit — then `POST`s `{ image, notes }` to `/api/extract-receipt`
   (`notes` omitted entirely when empty, so a user with no notes sends
   the exact same request shape as before personalization existed).
5. **Server** — `api/extract-receipt.ts` validates the body and checks
   `OPENAI_API_KEY`. Missing key → the demo-mode response (§4/§8), not a
   500. Otherwise it calls `extractReceiptItems()` in
   `api/_lib/openaiExtract.ts`, the actual OpenAI client (see §4 for the
   request/response details and error taxonomy).
6. **Items land immediately** — extracted items are written to `items`
   (`source: 'ai'`) as soon as the response parses, *not* gated behind the
   review step below. This is deliberate: ignoring or dismissing the review
   panel never loses anything, it's purely a reconciliation pass.
7. **Match suggestions** — for each extracted item, `isLikelyMatch()`
   (`src/lib/itemMatch.ts`) checks it against any already-typed items on
   the trip, to suggest merges (e.g. typed "Milk" vs. scanned "Milch 1L").
   It's deliberately simple (full-string then per-token Levenshtein
   distance, both after NFD diacritic stripping) and **not
   translation-aware** — "eggs" won't match "Eier". A false positive is a
   one-tap dismiss in the review panel; a false negative just leaves two
   separate entries. See CLAUDE.md's "Known limitations" for the standing
   call not to fix this speculatively.
8. **Review/merge panel** (`ReceiptReviewPanel.tsx` /
   `useReceiptReview.ts`) — shown automatically for any `done`,
   not-yet-`reviewed` receipt. Lets the user edit/remove a misread line and
   confirm/reject each suggested match; confirming a match deletes the
   typed duplicate and keeps the AI-extracted row (so anything the AI set
   on it, like `essentialOverride`, survives the merge for free).
9. **Save trip** — `completeTrip()` marks the trip `complete` and
   immediately creates+pins a fresh empty draft as the new active trip.

## 4. AI integration specifics

**Model**: `gpt-4.1-mini` (vision-capable, cheap enough for a personal
project's usage volume). This replaced an earlier Groq-based
implementation — see `DOCS/CHANGELOG.md` for that migration's specifics;
nothing about *why* Groq was dropped is repeated here.

**Request shape** (`api/_lib/openaiExtract.ts`): a single chat completion
call — one static `system` message (the extraction rules + JSON shape) and
one `user` message whose `content` is an array: an instruction string,
optionally a second text block with personalization (see below), then the
image as `image_url` with `detail: 'high'` (needed for OpenAI to actually
read small receipt text rather than a downsampled thumbnail). `temperature:
0` for consistent extraction, `response_format: { type: 'json_object' }` to
constrain output, `max_completion_tokens: 4500` (receipts with many line
items need real headroom to avoid getting cut off mid-generation — see
truncation handling below).

**Personalization stays out of the static prompt.** `SYSTEM_PROMPT` is a
fixed module-level string — it never changes per request. Category notes
are appended as a *second* text block in the `user` message, built by
`buildPersonalizationText()`, which returns `null` (nothing added) when the
client sent no notes. This keeps token cost/shape identical to the
no-personalization case for the common case, rather than bloating every
request with an always-present-but-usually-empty block. The instruction
itself is written as a literal requirement ("set `essentialOverride` to
`false`... never `true`"), not a computed relationship — see §2's note on
why that matters.

**Error taxonomy** — every distinct failure mode is tagged with a stable
text marker inside the thrown `Error`'s message (deliberately, not an
accident of string formatting), so `src/features/receipt-capture/errorMessage.ts`
can map each to distinct user-facing copy without re-deriving the
classification from scratch on the frontend:

| Marker / signal | Meaning | User-facing copy |
|---|---|---|
| HTTP 429 + `"type": "tokens"` body | Request itself (image+prompt) exceeds the account's tokens-per-minute limit | "Receipt image too large for current plan" — **not** auto-retried, since waiting doesn't shrink the request |
| Ordinary HTTP 429 | Rate limited | "Too many requests — retrying automatically", auto-retried per the parsed wait time |
| `finish_reason: "length"` + salvage found nothing usable | Response cut off by `max_completion_tokens` before finishing | "Receipt has too many items — try splitting it into two photos" |
| Malformed JSON | Model output didn't parse, or parsed but yielded no items | Generic "Couldn't read this receipt — try again" |
| `demo: true` in a 200 response | No `OPENAI_API_KEY` configured on this deployment | Friendly demo-mode explanation, styled muted (not alarming red) — see §8 |
| Network/timeout failure | No response reached the client at all | "Connection issue — try again" |

**Response parsing/salvage** — a 200 response isn't necessarily a clean
parse: `parseExtractedItems()` tries strict `JSON.parse` first, and on
failure walks the raw text tracking brace depth and string state to pull
out every syntactically complete `{...}` item object individually,
skipping only the one(s) that are actually broken. This replaced an
earlier all-or-nothing behavior that discarded a full 12-item response over
one malformed trailing object.

**Retry/backoff** — `parseRetryAfterSeconds()` extracts OpenAI's own "...try
again in 16.6s..." text and schedules a real `setTimeout`-driven auto-retry
in `ReceiptRow` (not just a countdown display). Token-limit and demo-mode
failures never get one, since retrying the identical request can't
possibly succeed differently.

## 5. PWA/offline behavior

Configured via `vite-plugin-pwa` in `vite.config.ts` (`registerType:
'autoUpdate'`, Workbox `generateSW` strategy). **`npm run dev` has no
service worker at all** — Vite's dev server doesn't build one; this is
exactly why offline/PWA behavior has to be tested against `npm run
preview` (a real production build), see §7.

**Caching strategy is deliberately split by resource type.** JS/CSS/images
(`workbox.globPatterns: ['**/*.{js,css,png,svg,ico}']`) are precached and
served cache-first, same as any typical PWA asset — their content isn't
secret and `middleware.ts` (§8) already gates them at the network layer
for any request that does reach it. **The HTML documents
(`index.html`/`login.html`) are deliberately excluded from precaching
entirely**, and navigations (`request.mode === 'navigate'`) instead go
through a `runtimeCaching` entry using Workbox's `NetworkFirst` handler
(`cacheName: 'pages'`, `networkTimeoutSeconds: 4`) — every navigation
tries the real network first, falling back to whatever was last
successfully cached only when genuinely offline. This is load-bearing for
§8's auth gate, not just an offline nicety: `middleware.ts` only ever runs
for requests that actually reach Vercel, so a cache-first navigation
strategy (Workbox's `generateSW` default, `navigateFallback:
'index.html'`) would let a returning visitor's cached app shell bypass the
gate forever, silently, for every single visit — not a one-time stale-SW
transition. Setting `navigateFallback: ''` alone does **not** disable this
on its own: `workbox-precaching`'s `precacheAndRoute()` registers its own
route with a `directoryIndex: 'index.html'` default, matching `/` against
whatever's precached, registered *before* any `runtimeCaching` route and
completely independent of `navigateFallback` — the HTML files have to be
kept out of the precache manifest entirely (via `globPatterns`) for that
built-in route to have nothing left to match. Verified with a throwaway
probe reading a counter from inside the service worker's own execution
context (`context.serviceWorkers()[0].evaluate(...)`) — `page.route()`/
`context.route()` can't observe this distinction at all, since a response
Workbox answers purely from Cache Storage never becomes a new
network-level request in the first place.

**What works fully offline**: viewing/editing the shopping list, adding
items, capturing a receipt photo (stored straight into IndexedDB as a
`Blob`, no upload attempted at capture time), and browsing History, Stats,
and Customize — all pure local Dexie reads.

**What requires connectivity**: only the actual OpenAI extraction call. A
receipt captured offline just sits at `status: 'pending'` in the queue;
the moment the browser fires its `online` event, the sweep in
`useReceiptCapture.ts` picks up every pending/failed receipt across *all*
trips (not just the active one) and processes them one at a time, reusing
the exact same extraction/retry path as a manual click.

**Installability**: the Web App Manifest (name, icons, `display:
'standalone'`, theme/background colors matching the app's dark UI) is
generated by the same `vite-plugin-pwa` config — "Add to Home Screen" on
mobile gets a real app-like launch with no browser chrome, no app store
involved.

## 6. Navigation/tab system

`App.tsx` owns all navigation as a single `view` union type
(`shopping`/`history`/`stats`/`customize`/`trip-detail`/`home`/`about`).
`TAB_ORDER` (the 4 main tabs) is the single source of truth for both the
tab bar's rendering order and swipe direction — Home and About are
deliberately excluded from it: they're corner icons reached only by
tapping, never swiped to, and don't participate in the tab-persistence
scheme below the same way.

**Two independent storage mechanisms, two different lifetimes**:

- **`localStorage['grocery-buddy:activeTab']`** — the last active main tab,
  written on every change. Read back via `useState`'s **lazy initializer**
  (a function passed to `useState`, not a `useEffect`) specifically so the
  restored tab is already correct on the very first render —
  `TabTransition` only plays its slide animation when the active tab
  differs from the previous render it saw, so restoring via an effect
  (landing on "shopping" for one render, then jumping) would have visibly
  slid in instead of just being there.
- **`sessionStorage['grocery-buddy:homeSeenThisSession']`** — whether this
  browser tab/session has navigated past Home yet. sessionStorage is the
  right primitive here specifically because it survives a same-tab reload
  but resets on a real close/reopen, which is exactly the distinction
  needed: on load, if this flag isn't set, Home is shown regardless of
  whatever `localStorage` has persisted (a genuinely fresh app open); once
  the user reaches any of the 4 main tabs (tapping the Home CTA or any nav
  tab — About doesn't count), the flag is stamped and every subsequent
  reload in that session goes back to the normal localStorage-restore
  behavior above.

**`TabTransition.tsx`** renders the outgoing and incoming tab as two
grid-stacked panels (`gridArea: '1 / 1'`) with direction-aware,
asymmetric-eased slide animations, respecting `prefers-reduced-motion` via
a plain CSS media query that zeroes out the `.gb-tab-slide` animation
(rather than a JS branch — simpler, and the animation literally doesn't
run rather than running at zero visible duration). One real subtlety
documented directly in that component: the *current* tab's wrapper `<div>`
must keep the same React `key` across the render where it switches from
playing the "current" role to playing the "outgoing" role, or React reads
the key change as a different element and remounts that tab's whole
subtree — losing live-query state — right as the transition starts.

**Swipe gestures** are raw `touchstart`/`touchmove`/`touchend` listeners on
the top-level `<main>` (not a gesture library): a direction only "commits"
once movement exceeds a threshold more horizontal than vertical, so normal
vertical scrolling is never hijacked; touches starting on a native form
control are ignored outright (those need full native touch ownership).
`touch-action: pan-y` on `<main>` plus a speculative `preventDefault()`
during the ambiguous window is what stops the browser from also
rubber-banding the page horizontally underneath a committed swipe.

**Mascot** (`src/features/mascot/`) appears on every tab, but only one of
them drives it off live state. `Mascot.tsx` is a dumb `<img>` keyed by a
`MascotPose` union (`idle`/`scanning`/`happy`/`error`/`thumbsup`/
`thankyou`/`excited`/`onit`/`receiptfound`, each mapped to a
`public/mascot/*.png`) — it has no logic of its own. `useMascotPose.ts` is
the one hook with actual pose logic, and it's only wired up on Shopping
List (`ReceiptCapture.tsx`): `scanning` while any pending receipt is
`processing`, else `happy` once a done-and-unreviewed receipt shows up
(persisting until the trip is saved), else `error` while any receipt is
`failed`, else `idle` — that priority order (`scanning > happy > error >
idle`) is deliberate, so an in-flight or just-succeeded scan is never
covered up by an older failure sitting alongside it. Every other page just
renders `<Mascot pose="..." />` with a fixed pose and no hook involved:
Home (`thumbsup`) and About (`thankyou`) show it large and centered as a
page-level illustration; History (`receiptfound`), Stats (`onit`), and
Customize (`excited`) show it small (32px) inline next to the `<h1>` — kept
small on those three specifically so it doesn't push list/chart/accordion
content down (Customize in particular needs all 11 categories to fit one
screen without scrolling).

## 7. Testing approach

**E2E tests run against `npm run preview` (a real production build), never
`npm run dev`.** This isn't a style preference — dev mode has no service
worker at all (§5), and a large fraction of what these tests actually
exercise (offline receipt capture, auto-sync on reconnect) *is* the service
worker/offline code path. Testing against dev would silently test nothing
real for those flows.

**Philosophy: end-to-end over unit tests for stateful, multi-step flows.**
Receipt capture → offline queue → reconnect sync → extraction → review →
save is exactly the kind of flow that breaks silently at the *seams*
between steps (a race between two triggers, a Dexie transaction that
doesn't actually close a gap, a hook that fires one render too late) —
bugs a unit test of any single function wouldn't catch, because the
function in isolation is correct. `claimReceiptForProcessing`'s
transaction-based race close (§3) and the active-trip pointer's
create-race guard (§2) are both covered by dedicated race-condition e2e
specs (`receipt-auto-sync.spec.ts`, `active-trip.spec.ts`) for exactly this
reason, not by testing `claimReceiptForProcessing` alone.

**Network is always mocked.** Every spec that exercises extraction uses
Playwright's `page.route('**/api/extract-receipt', ...)` to fulfill with a
canned response — no test ever hits the real OpenAI API (no cost, no
flakiness from a real network call, deterministic responses for testing
specific error-taxonomy branches from §4).

**`e2e/fixtures.ts`** is a thin wrapper around `test`/`expect` that
pre-seeds the `homeSeenThisSession` sessionStorage flag (§6) before every
test's first navigation. It exists so the ~20 existing specs — all written
before Home existed, all assuming `page.goto('/')` lands directly on
Shopping List — didn't need their test bodies touched when Home shipped;
only their import line moved from `@playwright/test` to `./fixtures`.
Specs that need the real, unseeded fresh-launch path (`home.spec.ts`)
import straight from `@playwright/test` instead, deliberately bypassing the
fixture.

## 8. Deployment setup

Two separate Vercel projects, both pointed at this repo, deliberately
configured differently:

- **Production** (personal use) — `OPENAI_API_KEY` set to a real key in
  the Vercel dashboard, both Production and Preview environments. Receipt
  scanning fully functional.
- **Demo** (`grocery-buddy-demo.vercel.app`, public showcase) —
  deliberately has **no** `OPENAI_API_KEY` set, so `api/extract-receipt.ts`
  always takes the demo-mode branch (§4): a 200 response with `demo: true`
  instead of a 500, which the frontend turns into a friendly "scanning is
  disabled in this public demo" message rather than an alarming error.
  Every other feature works identically to Production, since none of them
  touch the API key at all (§1). `APP_PASSWORD` (below) is likewise never
  set here, so Demo also stays open with no login gate.

Production is additionally gated behind a shared password —
`middleware.ts` (Vercel Edge Middleware, repo root) checks an
`APP_PASSWORD` env var on every request before it reaches either a static
asset or a serverless function, redirecting an unauthenticated page
request to `public/login.html` and returning a `401` for an unauthenticated
`/api/*` request (including `extract-receipt`) — the actual cost-risk
route is blocked server-side, not just hidden behind a client-side screen.
Exactly the same "env var absence turns the feature off" convention as
`OPENAI_API_KEY`/demo-mode above: `APP_PASSWORD` is set only on the
Production project's dashboard, never on Demo, so `middleware.ts`'s first
line (`if (!process.env.APP_PASSWORD) return`) is a no-op there despite
both projects running the identical file. Session is a stateless signed
cookie (`api/_lib/auth.ts`, Web Crypto HMAC-SHA256 over an expiry
timestamp, keyed by `APP_PASSWORD` itself) — no session store, verified
fresh on every request in both the Edge (`middleware.ts`) and Node
(`api/login.ts`) runtimes from the one shared module.

This gate only works because navigations are network-first, not
cache-first — see §5's caching-strategy split for why, and why a
cache-first shell would otherwise let it be silently bypassed forever by
any returning visitor. `vercel.json` additionally sets
`Cache-Control: no-cache` on `/sw.js` so browsers never skip their own
service-worker update check due to HTTP caching on the SW script itself —
Workbox's own documented best practice, and the fastest realistic lever
for an already-affected visitor's browser to pick up a fix like this one,
short of them knowing to unregister the service worker manually in
DevTools.

Per `CLAUDE.md`'s git workflow: pushing to `main` triggers a Production
deploy; any other branch or open PR gets its own auto-generated Preview
deployment URL, useful for eyeballing a change before merging.

`OPENAI_API_KEY` needs to be set in **two places that don't share
values** — `.env.local` (gitignored, local dev only, read by Vite) and the
Vercel dashboard (Vercel never reads `.env.local`). A key present only
locally means local dev works but the deployed function 500s (or, since
demo mode exists, silently runs in demo mode) — see `README.md`'s
Environment variables section for the operational how-to.

`api/extract-receipt.ts` sets `export const config = { maxDuration: 30 }`
because `openaiExtract.ts`'s own request already aborts at 25s — without
raising the function's own limit, Vercel's platform default (10s on Hobby,
15s on Pro) would kill the function first on a genuinely slow (not
rate-limited) OpenAI response, before that 25s abort ever gets a chance to
produce a real error message.
