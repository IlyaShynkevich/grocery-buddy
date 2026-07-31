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
- **Frontend design pass (grayscale palette)**: done and verified in
  production. Checked the available skills first (`ui-styling`,
  `design-system`) — both assume a Tailwind/shadcn stack, which this
  project deliberately doesn't use (plain
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
- **App name consistency + placeholder icon**: done and verified in
  production. Still using a placeholder icon (see Planned section below for
  the full mascot/icon redesign).
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
    same coordinates.
- **Footer + README rewrite**: done and merged to production.
  - Added a simple footer (mascot icon + "Ilya Shynkevich" + app version,
    read from `package.json`) shown below the primary content on every
    page, sitting just below the DB Debug Panel. The mascot icon reuses the
    same placeholder shopping-bag glyph as the app icon/favicon
    (`public/favicon.svg`) via one swappable constant, rather than being
    baked in, so the later mascot redesign is a one-file swap.
  - `<main>` switched from `display: flow-root` to a column flex layout
    (`min-height: 100svh`) with the footer given `margin-top: auto`, so it
    pins to the true bottom of the viewport on short pages instead of
    leaving empty space below it, while still sitting flush after content
    that overflows the viewport. (The flex container is its own block
    formatting context too, so this keeps the earlier flow-root fix for the
    `<nav>` top-margin collapse bug.)
  - README.md rewritten to describe the app as it actually is now
    (receipt scanning via Groq, offline support, trip history, monthly
    stats) instead of the leaner pre-M4 description, plus added the
    missing Testing section and `lint` command.
  - **Post-merge bug found, not yet fixed**: the DB Debug Panel isn't
    grouped with the footer at the true bottom of the screen — it's left
    with the regular page content above, so on short pages there's a gap
    between Debug tools and the footer instead of them sitting together.
    See Known issues below.
- **Layout width consistency pass**: done and verified in production.
  Root cause of several reported width bugs (Receipt section on Shopping
  List rendering centered/narrower than the rest of the page; History and
  Stats feeling squeezed; Debug tools a different width than the page
  content) was the same in every case: `pageStyle` (`src/lib/ui.ts`) sets
  `maxWidth: 480` plus `margin: '0 auto'`, and every page section is a flex
  item of `App.tsx`'s column-flex `<main>` — but a flex item with auto
  cross-axis margins opts out of the default stretch-to-container sizing
  and instead shrinks to fit its own content, so each section ended up a
  different width depending on how wide its content happened to be, only
  coincidentally matching. Fixed by adding an explicit `width: '100%'` to
  `pageStyle` (and the equivalent inline style in `ReceiptReviewPanel`) so
  each section has a definite width to stretch to before `maxWidth` clamps
  it — this alone made Shopping List, History, Stats, and Trip Detail
  consistent since they already shared `pageStyle`. The DB Debug Panel
  wasn't using `pageStyle` at all (just an ad hoc `margin: '1rem'`), so it
  now imports and uses it like every other page section. The footer got
  the opposite treatment — it dropped `maxWidth`/`margin: auto` entirely in
  favor of `width: '100%'`, so it reads as a true full-bleed footer bar
  instead of a small centered block, distinct from the capped-width page
  content above it. The top nav bar was deliberately left alone — it's
  meant to stay a centered, content-width pill, not stretch to the page
  width. Confirmed via computed-style + screenshot checks in a real
  browser (desktop viewport) at each affected page, plus the full
  Playwright suite (still passing, 51/51).
- **Debug tools grouped with the footer at the true bottom**: done and
  verified in production. Previously only the footer had `marginTop:
  auto`, so it alone got pushed to the bottom of the column-flex layout
  while Debug tools was left directly after the page content above it —
  fine on tall pages (content already reached the bottom) but leaving a
  visible gap between Debug tools and the footer on short pages (empty
  Shopping List, History with few trips). Fixed by moving `marginTop:
  auto` off the footer and onto a wrapping `<div>` in `App.tsx` that
  contains both `<DbDebugPanel />` and `<Footer />` — the group as a whole
  is what's pushed to the bottom now, so the two always sit flush together
  regardless of how little page content there is above. Confirmed via
  bounding-box checks (Debug tools' bottom edge exactly meets the footer's
  top edge, both flush against the viewport bottom on the shortest pages)
  plus the full Playwright suite (51/51).
- **Swipe gesture navigation between tabs**: done and verified in
  production. Swipe left/right on Shopping List/History/Stats moves
  forward/backward through the tabs (`TAB_ORDER`, derived from the same
  `TABS` array the nav bar renders — one source of truth), no wraparound
  past either end. Purely additive: tapping the tab bar is untouched.
  Implemented in `App.tsx` with raw `touchstart`/`touchmove`/`touchend`
  listeners (not pointer/mouse events) on the `<main>` ref, since the
  requirement was specifically to behave correctly for real touch input,
  not a mouse-drag stand-in for it:
  - A gesture only "commits" to horizontal once it has moved more
    horizontally than vertically past a small lock threshold; a
    vertical-dominant gesture is left alone from that point on, so normal
    scrolling is never hijacked. Below the lock threshold (e.g. a tap) it
    does nothing either way.
  - Touches starting on an interactive element (`button`, `a`, `input`,
    `textarea`, `select` — covers the tab bar buttons themselves, the
    receipt source-picker menu, form controls) are ignored from
    `touchstart`, so none of those existing interactions are affected.
  - `touch-action: pan-y` on `<main>` leaves vertical panning to the
    browser but stops it from also claiming horizontal panning, so the
    JS handler isn't fighting the browser for the same gesture.
  - `e.preventDefault()` is only called once a gesture has committed to
    horizontal, not on every `touchmove` — this is what keeps vertical
    scrolling untouched.
  Verified with Playwright tests using real `Touch`/`TouchEvent` dispatch
  under `hasTouch: true` emulation (`e2e/swipe-navigation.spec.ts`), not
  mouse-simulated drags — covering swipe left/right through all three
  tabs, no wraparound at either edge, a vertical scroll gesture not
  triggering a tab change, and tapping the tab bar still working
  alongside swipe. Full suite passing (56/56).
- **Slide animation for tab transitions + Debug tools hidden on Stats**:
  done and verified in production, two follow-ups to swipe navigation.
  - Tab switches (swipe or tap) now slide the outgoing tab out and the
    incoming tab in — direction matching the swipe/nav direction — instead
    of an instant hard-cut, via a new `TabTransition` component
    (`src/features/navigation/TabTransition.tsx`) wrapping the three tab
    views in `App.tsx`. Kept snappy on purpose: 220ms, `ease-out`.
    `prefers-reduced-motion: reduce` disables the animation entirely
    (`.gb-tab-slide` in `src/index.css`).
  - Two real bugs surfaced and got fixed while building this, both worth
    remembering if this component is touched again:
    1. The outgoing/incoming state was first computed in a `useEffect`,
       which runs one render *after* the prop change — on a quick
       back-and-forth (A -> B -> A) there was a one-render window where
       `outgoing` still held the previous switch's value while `activeTab`
       had already moved on, and on that exact tab it's momentarily the
       *same* tab as the new `activeTab`, so both rendered at once (e.g.
       two `data-testid="shopping-list"` elements — a real Playwright
       strict-mode violation). Fixed by computing it synchronously during
       render (the "adjusting state during rendering" React pattern, ref
       comparison, not an effect).
    2. The wrapper's DOM shape differed between "no transition in
       flight" (no wrapper at all) and "transition in flight" (wrapper +
       sibling) — so every time a transition *ended*, React saw the shape
       change and remounted the current tab's entire subtree, which could
       detach a DOM node mid-interaction (an e2e click landing right as
       the 220ms elapsed would hit an element that had just been torn
       down). Fixed by always rendering the same wrapper/current-tab
       shape; only the outgoing sibling and the current tab's `animation`
       style are conditional.
  - Debug tools is now hidden entirely on the Stats tab (`activeTab !==
    'stats'` in `App.tsx`, not `view.name`, so trip detail — reached via
    History — still counts as "in History") — Stats is a read-only report
    with nothing to debug, unlike Shopping List/History where trip/receipt
    data is actively worked with.
  - `e2e/swipe-navigation.spec.ts`'s swipe tests needed a settle wait
    (~300ms) after any transition-triggering action before computing the
    next swipe's touch coordinates from a `boundingBox()` — the incoming
    page is still mid-slide (translated) for the ~220ms the animation
    runs, and `boundingBox()` reports wherever it currently is, not its
    resting position; it doesn't wait for animations the way Playwright's
    own actionability checks do.
  - **Pre-existing bug found while testing, not caused by this work, not
    fixed**: `e2e/trip-delete.spec.ts`'s "deleting the trip currently
    pinned as active starts a fresh empty draft" test fails deterministically
    (confirmed by re-running against the prior commit with none of this
    session's changes applied) — clicking a trip's "Make active" in the DB
    Debug Panel doesn't reflect `data-active="true"` on that row. Root
    cause not investigated; likely a reactivity gap between
    `db.appState.put` and the panel's `activePointer` live query. See Known
    issues below.
- **Mascot poses (idle/scanning/happy) on the Shopping List page**: done and
  verified in production. Real posed artwork (`MASCOT/Mascot_main.png`,
  `Mascot_analysing.png`, `Mascot_happy.png` at the project root, provided by
  the user) replaces the old placeholder in this one spot — the shared
  shopping-bag glyph used for the favicon/app icons/footer is untouched.
  - Source PNGs had a flat black background baked in, not real alpha — and,
    trickier, the mascot's own black facial features (eyes/mouth/eyebrows)
    are the *same* black, so a naive "make all near-black pixels
    transparent" pass would have deleted the face along with the
    background. Processed with a connected-components approach instead
    (Python/Pillow/scipy, one-off, not a project dependency): flood-fill
    the near-black mask, transparent = the region touching the image
    border (true background) plus any enclosed near-black region large
    enough to be the gap under the bag's carry handle (~25k px) rather
    than a small facial feature (largest is the happy pose's open mouth
    at ~9.8k px) — that size gap cleanly separates the two across all
    three images.
  - The scanning pose's magnifying glass was the one case this couldn't
    resolve automatically: its ring is genuinely contiguous with the true
    background in the source pixels (confirmed via connected-component
    analysis — the pose has 5 near-black components total where the other
    two poses have 12+, because the ring merged into the border-touching
    background component instead of being its own shape), so flood-fill
    alone would have erased it. Fixed by measuring the ring's true
    center/radii from its one fully-bounded reference point (the isolated
    tan lens disk, found the same connected-components way) and forcing
    that annulus opaque regardless of what the flood-fill decided.
  - Saved as 256×256 RGBA PNGs at `public/mascot/{idle,scanning,happy}.png`
    (~29-30KB each) — resized down from the 1254×1254 source, which was
    far larger than this pixel-art needs at the size it's actually shown.
  - `src/features/mascot/useMascotPose.ts` derives the pose: `scanning`
    whenever any pending receipt is `processing` (passed in as a plain
    boolean by the caller, deliberately not read via its own
    `useReceiptCapture()` call — that hook also wires up the online-sync
    effect and stranded-processing reclaim, which must stay singletons);
    otherwise `happy` once a done-and-unreviewed receipt shows up
    (`usePendingReceipt`, the same signal the review panel itself uses),
    persisting until the trip is saved, then `idle`.
    `src/features/mascot/Mascot.tsx` is just the `<img>` for a given pose.
  - Rendered in `ReceiptCapture.tsx`, to the right of the "Receipt"
    heading/"Add receipt photo" button column (a flex row wrapping what
    used to be the section's direct children).
  - Covered by `e2e/mascot-pose.spec.ts` — extends the same stateful-flow
    coverage philosophy as the M4/M5 receipt tests.
- **Mascot pose follow-ups (ring legibility, color match, happy
  persistence)**: done and verified in production.
  - The scanning pose's magnifying glass read as a plain blurry circle at
    the ~64px size it's actually displayed at — its ring was only ~48px
    thick in the 1254px source (already thin relative to the whole
    graphic), which shrinks to under 3px by the time it's scaled down.
    Fixed at the processing-pipeline level (not by changing the app's
    display size): the ring is now repainted thicker — inner/outer radius
    80/178px instead of the original ~88/136px, mostly expanded outward so
    the lens' negative space stays recognizable — directly in the source
    raster before the 256×256 resize, so it stays legible once scaled down
    to display size.
  - The three poses' fill colors didn't actually match — confirmed this
    was a real inconsistency in the user's three separately-generated
    source images (measured via HSV: all three have near-identical
    brightness/value ~98%, but the scanning pose's fill is both more
    saturated and more orange-shifted in hue than idle's), not anything
    introduced by the transparency/resize pipeline. Fixed with a
    brightness-weighted hue/saturation correction — shift scanning's and
    happy's fill hue/saturation toward idle's (the reference), with the
    correction strength ramping from 0 at outline-dark brightness to full
    strength at fill-bright brightness, so the already-consistent brown
    outline color is left alone while the mismatched fill gets corrected.
  - The happy pose was originally a ~1.8s pulse that auto-reverted to
    idle — easy to miss. Changed to persist indefinitely once triggered,
    only clearing on Save trip (a new active trip id, tracked in
    `useMascotPose` via `useActiveTripId`) rather than on a timer;
    dismissing/confirming the review panel no longer affects it. If a
    second receipt gets captured and processed while already happy,
    `scanning` still takes priority for that window (the `isProcessing`
    check runs first) and it reverts to `happy` once that one finishes too
    — the happy state itself was never cleared in between, so there's
    nothing to "return to" so much as it was never interrupted.
  - `e2e/mascot-pose.spec.ts` rewritten: covers happy persisting well past
    the old pulse duration and through dismissing the review panel, only
    clearing on Save trip; plus a second test for the
    scanning-while-already-happy interruption case.
- **Scanning pose replaced with an improved source image**: done and
  verified in production. The user provided a redrawn `MASCOT/
  Mascot_analysing.png` — same ring-and-lens motif as before, but now with
  an actual handle held up to the eye (much more recognizable as a
  magnifying glass than the previous handle-less ring) — regenerated
  `public/mascot/scanning.png` from it through the same pipeline.
  - This source image has the same "prop is genuinely pixel-contiguous
    with the true background" property as the original ring did, just
    more so: connected-component analysis again shows only 5 near-black
    components (background+ring+handle merged into one, plus the
    isolated lens reflection dot, the other eye, and the mouth) — nothing
    new here, same category of problem as before, solved the same way
    (measure true geometry from the one bounded reference point — the
    isolated lens disk — then force that region opaque regardless of
    what flood-fill decided).
  - The handle itself doesn't reduce to a simple annulus like the ring
    does. Traced its silhouette from the source pixels (row-by-row
    tan/black transition scans across the region between the ring and the
    bag's left edge) and modeled it as a straight thick capsule from where
    it meets the ring down to a modest overhang past the bag's own edge —
    good enough at the size this is actually displayed, not intended as
    pixel-perfect vector tracing.
  - Same ring-boldening treatment as before (thickened beyond the source's
    actual line weight so it stays legible once scaled down to display
    size) and the same brightness-weighted hue/saturation color-match
    correction toward idle's fill (this source image's own fill color
    again didn't match idle/happy out of the box — expected at this point,
    since each pose is still an independently-generated image).
- **Scanning ring thickness dialed back + shopping list no longer
  re-expands after a review resolves**: done and verified in production.
  - The v2 ring-boldening (inner/outer radius 85/190, ~2.5x the source's
    own ~41px thickness) read as over-bolded/blobby compared to the
    reference art once seen live. Rendered several thickness options side
    by side at the actual ~64px display size (including the raw,
    unboldened source thickness) to compare rather than guessing — the
    unboldened ring already read reasonably clearly on this v2 image
    (unlike the v1 ring-only art, the added handle gives it context), so
    only a small bump was kept: inner/outer 93/140 (~47px thick, barely
    more than the source's own ~41px) instead of the previous 85/190.
  - Separately, confirming or dismissing a receipt review was force
    re-expanding the shopping list even if it had been left collapsed —
    caused by `ShoppingListPage`'s old collapse logic deriving `isOpen` as
    `manualOpen ?? !hasPendingReview`: once `hasPendingReview` flipped back
    to `false` on resolve, that fallback expression itself evaluated to
    `true` regardless of anything else, no matter what `manualOpen` was
    reset to. Replaced with a single persistent `isOpen` state that only
    gets forced `false` on the *rising* edge of `hasPendingReview` (a new
    review becoming pending) — resolving a review no longer touches it at
    all, so a still-collapsed list stays collapsed until the user expands
    it via the toggle themselves. The toggle affordance itself now also
    stays visible whenever the list is currently collapsed (not only while
    a review is actively pending), since otherwise there'd be no way to
    manually reopen a list left collapsed after the review closed.
  - Also added: saving the trip (a new active tripId) now resets this
    state back to expanded — a fresh empty draft has no review history of
    its own, so it shouldn't inherit whatever collapsed state the just-
    finished trip's review left behind.
  - `e2e/shopping-list-collapse.spec.ts` updated: the two tests
    encoding the old "always re-expands on resolve" behavior now assert
    the opposite (stays collapsed, toggle still present); added tests for
    a manually-expanded list staying expanded through a resolve, and for
    Save trip resetting a stale collapsed state on the new draft.
- **App icon replaced with real mascot artwork**: done and verified in
  production. The last placeholder touchpoint — the gray hand-drawn
  shopping-bag glyph in `favicon.svg`/`icon-192.png`/`icon-512.png`/
  `apple-touch-icon.png` — is now the same mascot art used everywhere
  else, from a new front-facing source image (`MASCOT/Mascot_icon.png`).
  - Same transparency pipeline as the in-app poses (connected-components
    background/handle-hole removal, HSV color-match correction toward
    idle's fill — this source's fill color didn't match out of the box
    either, as expected by now).
  - Unlike the mascot poses, these are real app icons, and `icon-512.png`
    is also declared `purpose: maskable` in the manifest (`vite.config.ts`)
    — OS launchers can crop a maskable icon to any shape, so content needs
    to stay inside the safe zone (roughly the inner 80%-diameter circle)
    and the canvas needs an opaque background rather than relying on
    transparency. Composited the transparent mascot onto the same solid
    `#1e1f27` background the placeholder icons already used, scaled so the
    glyph's longer side fills ~62% of the canvas (similar proportions to
    the old placeholder, comfortably inside the safe zone) — generated at
    512×512, 192×192, and 180×180 (apple-touch) from one shared crop.
  - `favicon.svg` stays an SVG file (so nothing referencing it needs to
    change) but now just wraps a `<image>` embedding a small (128px)
    version of the same processed PNG as a base64 data URI, with
    `image-rendering: pixelated` — hand-tracing this pixel-art mascot as
    vector paths the way the flat-shape placeholder was written isn't
    practical. Used 128px rather than the full 512px render to keep the
    embedded SVG's file size reasonable (~8KB rather than ~90KB).
  - Verified at actual favicon size (32px, 16px) — reads clearly as a
    smiling bag down to 32px; 16px is soft but still recognizable, which
    is normal for a detailed icon at that size (the old flat-shape
    placeholder had an easier time here precisely because it was simpler,
    not because detailed icons are expected to stay crisp at 16px).

- **Receipt extraction 502s masking real Groq 429s, and a retry-backoff
  bypass**: fixed, not yet merged. Investigated after 8+ consecutive 502s
  showed in Vercel logs over ~20 minutes (each 198-850ms, "too fast to be
  Groq") while the UI showed "Too many requests." Traced the full path
  rather than guessing:
  - `api/extract-receipt.ts` was unconditionally converting *any*
    extraction failure to HTTP 502, including a real Groq 429 — the "429"
    only ever reached the browser as text inside the error message
    (`groqExtract.ts`'s `` `Groq returned ${response.status}: ...` ``),
    and the frontend classified purely by regexing that text
    (`errorMessage.ts`'s `` /\b429\b/ ``), never the actual status code.
    So the UI message was correct — it really was Groq 429s — but Vercel's
    own dashboard read as a server crash instead of a rate limit, which is
    what made this look alarming enough to investigate. Fast durations
    aren't suspicious either: a 429 rejection happens before Groq runs any
    inference.
  - Fixed by having `groqExtract.ts` throw a `GroqHttpError` carrying
    Groq's real status, and `extract-receipt.ts` forwarding it as-is for
    4xx (429, 400, 413, ...) while still collapsing 5xx/transport/timeout
    failures to 502 (accurate "bad gateway" semantics for an upstream
    failure, vs. 4xx describing something about our own request). The
    frontend (`extractReceipt.ts`'s new `ExtractionRequestError`,
    `PendingReceipt.lastErrorStatus` in `db.ts`, `errorMessage.ts`) now
    checks `status === 429` as the primary signal, keeping the text regex
    only as a fallback.
  - Separately, found a real bug while reading the retry path: the
    online-reconnect sweep (`useReceiptCapture.ts`'s `syncPendingReceipts`)
    retried every `pending`/`failed` receipt on any `online` event with no
    check of `retryAt` at all — unlike the per-row auto-retry timer, which
    does respect it. Repeated `online` events (flaky mobile connectivity
    reconnecting/dropping, which the app already listens for) could retry
    a just-429'd receipt before Groq's own requested backoff window
    elapsed, re-triggering the same rate limit — a more likely explanation
    for a sustained 20-minute burst than quota alone. Fixed by having the
    sweep skip `failed` receipts whose `retryAt` is still in the future.
  - Also added `maxDuration: 30` to `extract-receipt.ts`'s function config
    — `groqExtract.ts`'s in-code `TIMEOUT_MS` (25s) exceeded Vercel's
    platform default (10s Hobby / 15s Pro) with no override anywhere in
    the repo, so a genuinely slow (not rate-limited) Groq call would have
    been killed by the platform first. Not the cause of this incident
    (durations were sub-second) but a real latent gap in the same code.
  - `e2e/receipt-retry.spec.ts` and `e2e/receipt-extraction.spec.ts`'s
    rate-limit mocks now return real HTTP 429 (previously 502-with-429-text,
    modeling the old flattened behavior); added
    `e2e/receipt-auto-sync.spec.ts`: "a rate-limited receipt with a
    pending auto-retry is not retried early by a reconnect sweep" for the
    backoff-bypass fix. Full suite: 60/61 passing — the one failure is the
    pre-existing, already-documented "Make active" bug below, confirmed
    unrelated (reproduces identically without any of this change applied).
- **`trip-delete.spec.ts` "Make active" test fix**: investigated and
  fixed, not yet merged. Root cause traced (not guessed): `TabTransition`
  keeps the outgoing tab mounted for its `TRANSITION_MS` (220ms) slide-out
  animation, so `ShoppingListPage`'s `useActiveTripId` instance stays
  fully reactive for that long after switching to the History tab. The
  failing test clicked "Make active" (pointing the pointer at a completed
  trip) fast enough to reliably land inside that window every run — and
  `useActiveTripId`'s self-heal logic (`getOrCreateActiveTrip` in
  `db.ts`), seeing a pointer aimed at a non-draft trip, immediately
  reassigned it back to the existing draft, undoing the click before the
  assertion could observe it. Deterministic (not flaky) because a
  synthetic Playwright click on an already-visible button consistently
  resolves faster than the 220ms window. Not a production bug: "Make
  active" is a dev-only debug affordance and the only way the pointer ever
  targets a non-draft trip at all — no shipped user path can reach this
  sequence. Fixed the test, not the app: added a wait for `shopping-list`
  to fully unmount (proving the outgoing tab's live query is gone) before
  clicking "Make active", same pattern as the existing
  `swipe-navigation.spec.ts` settle-wait. Confirmed with `--repeat-each=3`
  before and after; full suite now 62/62, no known-flake carve-out needed.
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

## Planned (not started)

- **Auto-scroll to top after confirming/dismissing a receipt review.**
  Right now the user has to manually scroll up to reach Save trip after a
  review resolves. Related to (but distinct from) the Debug tools/footer
  grouping bug above — this one is about scroll position after an action,
  not layout.
- **Full mascot/icon redesign**, waiting on custom artwork. Currently a
  placeholder gray shopping-bag icon is used everywhere it appears: the app
  icon, the favicon, and the footer.

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
