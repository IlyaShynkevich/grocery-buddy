# Grocery Buddy — Changelog

Full milestone-by-milestone and fix-by-fix history for Grocery Buddy, moved out of
`CLAUDE.md` to keep that file short. `CLAUDE.md`'s "Status" section has a one-line
summary of each milestone below and points back here for details.

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
  - **Post-merge bug found**: the DB Debug Panel isn't grouped with the
    footer at the true bottom of the screen — it's left with the regular
    page content above, so on short pages there's a gap between Debug
    tools and the footer instead of them sitting together. Fixed later —
    see "Debug tools grouped with the footer at the true bottom" below.
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
  reload instead of zero. Fixed later — see "Reset all data leaves
  phantom trips (root cause fixed)" near the end of this section.
- **Swipe transition smoothing + swipe-from-scrollable-list fix**: fixed,
  not yet merged. Two follow-ups on the swipe/slide-transition work above.
  - The 220ms slide felt too fast/abrupt even after the earlier duration
    fix. `TRANSITION_MS` (`TabTransition.tsx`) raised to 300ms, and the
    single shared `ease-out` split into two curves: the incoming tab now
    uses a decelerate curve (`cubic-bezier(0, 0, 0.2, 1)`), the outgoing
    tab an accelerate curve (`cubic-bezier(0.4, 0, 1, 1)`) — Material's
    standard enter/exit pairing. Previously both directions decelerated
    identically, which made the outgoing tab read as hesitating near the
    edge instead of speeding away.
  - Separately, swiping to change tabs from within History stopped
    registering once there were enough trips to make the page scrollable.
    First attempt (this bullet, superseded below): theorized a native
    `touch-action: pan-y` scroll-commit race in `onTouchMove` and added a
    speculative `preventDefault()` during the ambiguous gesture phase. That
    fix shipped with **no automated regression coverage** — real effort,
    including Chrome DevTools Protocol trusted touch input (which does
    drive real gesture recognition, unlike plain `dispatchEvent(new
    TouchEvent(...))`), never reproduced the theorized race at all.
  - **Second attempt found the real cause, and it was reachable by code
    reading, not a timing race.** `onTouchStart`'s `isInteractive` check
    (`App.tsx`) excluded any touch starting on a `button` or `a` from swipe
    consideration entirely, before the gesture is ever evaluated. In
    `HistoryPage.tsx`, each trip row is a `<button data-testid=
    "history-trip">` with `width: 100%`, and the list only has an 8px gap
    between rows — so once there's a real list of trips, a `<button>`
    covers nearly the whole visible list, and `onTouchStart` sets `phase =
    'ignored'` immediately for almost any touch starting "in the list."
    Because of that, `onTouchMove`'s early `if (phase === 'ignored')
    return` meant the *first* fix's speculative-`preventDefault()` code
    never even ran for this scenario — it was unreachable, not ineffective.
    Confirmed live (CDP trusted touch on a real `history-trip` button,
    against a running `npm run preview` build) that the swipe genuinely did
    nothing pre-fix, and did switch tabs post-fix. Fixed by narrowing
    `isInteractive` to `input, textarea, select` only — the controls that
    actually need full native touch ownership (text cursor placement, the
    native `<select>` picker). Buttons/links no longer block swipe
    detection: a real tap is unaffected (nothing here calls
    `preventDefault()` on touchstart/touchend for a stationary touch), and
    a genuine horizontal drag naturally won't also fire the underlying
    element's click, per standard mobile "tap slop" behavior. Grepped `src/`
    to confirm `App.tsx` is the only file with any touch/pointer/drag
    handling, so nothing else depends on buttons being excluded. Kept the
    first attempt's speculative-`preventDefault()` change in place too
    (harmless, and now actually reachable for non-button swipe starts).
    This time has real automated coverage: `e2e/swipe-navigation.spec.ts`'s
    "swiping starting directly on a history-trip button still switches
    tabs" test uses CDP trusted touch input (confirmed necessary — plain
    `dispatchEvent` doesn't reliably exercise this), seeds 15 trips so the
    list is button-dense, and swipes from a point directly on a trip
    button.
  - **A second, unrelated bug found during the same manual testing pass**:
    the slide transition visibly showed the outgoing and incoming pages'
    text overlapping/bleeding together mid-animation (e.g. "History" and
    "Save trip" simultaneously visible in the same space) — a regression
    from the animation-smoothing bullet above. Root cause, confirmed by a
    frame-by-frame `getBoundingClientRect()` trace against a real
    `npm run preview` build: the outgoing (`position: absolute`) and
    incoming (`position: static`) panels only tile edge-to-edge with zero
    overlap if they stay exactly one panel-width apart at every instant,
    which requires both to progress the same fraction of their distance at
    the same time — i.e. the *same* easing curve. The asymmetric
    decelerate/accelerate curves introduced above broke that invariant:
    measured up to ~194px of genuine geometric overlap mid-transition (out
    of a 390px-wide viewport) in a real trace. Neither panel had its own
    background (`pageStyle` in `src/lib/ui.ts` sets none; `--bg` is only
    painted at the shared `body` level), so wherever they overlapped, both
    panels' text rendered simultaneously. Fixed by giving both sliding
    panels in `TabTransition.tsx` an opaque `background: 'var(--bg)'` —
    verified live (before/after screenshots of the same worst-overlap
    frame) that this alone fully resolves the visible bleed, since default
    CSS stacking already paints the `position: absolute` outgoing panel
    above the `position: static` incoming one, so once opaque it fully
    occludes whatever's behind it and progressively reveals the incoming
    page as it slides out of the way. No changes to the easing
    curves/duration/z-index were needed — the geometric overlap is now
    harmless rather than eliminated. Covered by
    `e2e/swipe-navigation.spec.ts`'s "outgoing and incoming tab panels stay
    fully opaque during a transition" test (asserts computed
    `backgroundColor` alpha is always 1 for both panels throughout a
    transition, sampled every animation frame) — deliberately checks
    opacity rather than geometric non-overlap, since the fix doesn't (and
    doesn't need to) make the overlap itself go away.
- **Pre-slide flick fix + History's trip list made internally scrollable**:
  done and verified in production. Two more follow-ups on the tab-
  transition/History work above.
  - A flick/snap was visible right before every slide animation started
    (swipe or tab-bar tap). Root cause, confirmed live (marked the real
    `shopping-list` DOM node with a unique attribute, triggered a switch,
    checked immediately after — the node was already gone): the outgoing
    panel's wrapper `<div>` in `TabTransition.tsx` was keyed
    `` `outgoing-${tab}` ``, different from the `` `current-${tab}` `` key
    that same tab's wrapper had one render earlier while it was still
    active. A key change reads to React as "different element," so it
    unmounted that tab's entire subtree and mounted a fresh one — losing
    already-resolved `useLiveQuery` data (most hooks, e.g.
    `useShoppingList`'s `items`, default to an empty/`undefined` value on a
    component's first render) and repainting a "loading" flash before the
    CSS animation's first frame. Fixed by keying both wrapper divs by the
    bare tab name (`outgoing.tab` / `activeTab`, never colliding since
    `outgoing` is always the *other* tab while a transition is in flight) —
    React now recognizes the wrapper as the same element across the
    current-to-outgoing role change and only updates its style in place, no
    remount. This is the same class of bug as the earlier "keep the current
    wrapper's shape stable" fix, just the symmetrical case at the *start* of
    a transition instead of the end, missed the first time. Confirmed live
    the same way (canary attribute now survives immediately after the
    switch, and is only actually removed once the transition genuinely
    settles); covered by `e2e/swipe-navigation.spec.ts`'s "the outgoing page
    keeps its DOM node identity instead of remounting when a transition
    starts."
  - History's trip list (`HistoryPage.tsx`) now sits in a `maxHeight: 29rem`
    (measured live: 9 rows at `cardStyle`'s actual rendered row height,
    ~44.375px, plus 8px gaps between them ≈ 463px — what fits on one screen
    without scrolling), `overflowY: auto` container
    (`data-testid="history-list-scroll"`) wrapping all month groups
    together, instead of an unbounded page that pushed Debug tools/the
    footer down and off-screen once there were enough trips. `max-height`
    (not a fixed `height`) so fewer trips (or a month-filtered view) still
    render at their natural height, no forced scrollbar/dead space — only
    content taller than ~9 rows clips and scrolls internally. The `<h1>`,
    "No saved trips yet" message, and the month-filter `<select>` stay
    outside/above the scroll container so they're always visible. Covered
    by two new tests in `e2e/history-improvements.spec.ts`: 12 trips
    produces an internally-scrollable list with Debug tools/the footer
    still in viewport without scrolling the page, and 3 trips produces no
    internal scrollbar.
- **Residual pre-slide blip fixed (instant vertical layout snap)**: done
  and verified in production. A second, separate follow-up to the flick
  work above — after the remount fix, a much smaller but still-perceptible
  blip remained right as a transition started.
  - Root cause, confirmed via a frame-by-frame `getBoundingClientRect()`
    trace against a real `npm run preview` build: `TabTransition.tsx`'s
    outgoing panel was `position: absolute` (contributes zero height to its
    container), so the wrapper's height was always driven solely by the
    *incoming* panel — and that's true from the very first render of a
    transition, not just at the end. If the outgoing/incoming pages have
    different natural heights (e.g. a populated Shopping List vs. an empty
    History), the wrapper's height — and therefore Debug tools/the footer's
    position below it — snapped instantly to the incoming page's height in
    the same commit that starts the transition, independent of and well
    before the horizontal slide had progressed at all. Measured directly: a
    ~159px jump in footer/Debug-toggle position between two consecutive
    animation frames (16ms apart), at the very start of a Shopping List
    (10 items) -> History (empty) transition.
  - Fixed by replacing the `position: relative` (wrapper) / `position:
    absolute` (outgoing panel) overlay with a CSS Grid single-cell overlap:
    wrapper `display: grid`, both panels given `gridArea: '1 / 1'` (no
    `position`/`top`/`left` needed — grid's default stretch handles
    sizing). Standard CSS Grid behavior: when multiple items share a track,
    the auto-sized track's height is the *max* of everything placed in it —
    so the wrapper now reflects the taller of the two pages for as long as
    both are present, only settling to the incoming page's height once the
    outgoing panel actually unmounts at the end of the transition (after
    the slide has already visually finished — a far less jarring moment for
    a layout shift). Verified live with the same frame-trace methodology:
    footer/debug-toggle position now stays completely still for the entire
    ~300ms both panels are present, only moving once at the very end when
    the outgoing panel is removed.
  - Since neither panel is `position`-based anymore, default paint order
    would otherwise flip to DOM order (the later-rendered incoming panel on
    top) — added an explicit `zIndex: 1` on the outgoing panel to
    deliberately preserve the stacking order the opaque-panels fix (above)
    relies on (outgoing paints above incoming, revealing it as it slides
    away).
  - Covered by a new test in `e2e/swipe-navigation.spec.ts`: seeds a
    height-mismatched Shopping List -> History transition, samples
    footer/debug-toggle position every animation frame, and asserts zero
    movement for as long as both panels are present (any movement in that
    window would be a snap, since the slide itself is purely horizontal).
- **Stats<->History height animation (direction-specific jump, superseding
  the CSS-Grid-only approach above)**: done and verified in production, one
  more follow-up on the transition-flick work. The previous fix (grid
  sizing to `max(outgoing, incoming)` while both panels are mounted) only
  *deferred* a height-driven snap to the moment the outgoing panel
  unmounts, rather than eliminating it — fine for small height differences,
  but Stats (by far the app's tallest page: two bar-chart cards) is ~430px
  taller than an empty History, and Stats -> History (Stats as the
  *outgoing*, taller panel) showed a real, ~285px jump a full 300ms *after*
  the slide had already visually finished — confirmed via a frame-by-frame
  trace. History -> Stats (Stats as *incoming*) didn't show this, since the
  wrapper was already sized to Stats' height from the transition's first
  frame — nothing left to defer.
  - Also found, same investigation: `App.tsx`'s
    `{activeTab !== 'stats' && <DbDebugPanel />}` — Stats is the only tab
    that hides Debug tools, and `activeTab` updates synchronously the
    instant a transition *starts*, not when it settles, adding an
    unrelated ~70px jump on top of the height-snap, at the wrong moment.
  - Fixed by replacing grid-only auto-sizing with an *animated* wrapper
    height: `TabTransition.tsx` captures the wrapper's current height synchronously
    (`fromHeight`) in the same state update that starts a transition, then a
    `useLayoutEffect` animates the wrapper's explicit `height` from that to
    the incoming panel's natural height via a CSS transition timed to
    `TRANSITION_MS` — the wrapper's existing `overflow: hidden` clips
    whichever panel is taller as it interpolates, so it reads as one
    continuous motion. Both panels also got `alignSelf: 'start'` so each
    one's own measured height is never inflated by the grid's default
    stretch-to-row-height behavior.
  - **A real complication, worth remembering if this is touched again**:
    most pages (including Stats and History) read their data via Dexie's
    `useLiveQuery`, which returns an empty/default value synchronously on
    first mount and only renders the real (often much taller) content once
    the async query resolves a beat later — confirmed live, Stats mounts at
    ~102px (0 category bars) and only becomes ~590px (real data) ~20-40ms
    after mount. Measuring the incoming panel's height only once (at
    transition start) reliably captured the wrong, too-short target for
    Stats specifically. Fixed with a `ResizeObserver` on the incoming panel
    that re-targets the still-in-flight height animation whenever its
    natural height actually changes, not just once — and each re-target
    does a full clean restart (snap to the current interpolated value with
    no transition, forced reflow, then re-enable the transition to the new
    target) rather than just changing the destination of an
    already-active transition, which was observed to overshoot past the
    final value when two re-targets landed close together (a restarted
    `ease-in-out` curve's velocity artifact).
  - **DbDebugPanel visibility gating (`App.tsx`) is settle-gated
    (`settledTab`, updated via a new `onSettle` callback from
    `TabTransition`), not `activeTab`-gated** — deliberately keeps it
    visible until a transition actually finishes rather than flipping
    the instant one starts.
  - **Known residual, not fully eliminated, worth being upfront about**:
    Debug tools' own show/hide is still a discrete, un-animated toggle —
    tested both `activeTab`-gating (instant, at transition start) and
    `settledTab`-gating (instant, at transition end) live, and neither
    eliminates its ~70px single-frame contribution, just relocates it to
    one end of the transition or the other. `settledTab` was kept since
    between the two, it puts that residual jump at the point where a
    smooth, already-in-motion animation has already made the layout shift
    feel mostly "expected" rather than as an isolated static-then-sudden
    jump. Fully eliminating it would mean animating Debug tools' own
    height too (real added scope, not attempted here) — flagged to the
    user as a known, accepted trade-off rather than silently claiming a
    fully perfect fix. The large, original content-height snap (the actual
    complaint) is fully resolved; this residual is far smaller (~70px vs.
    the original ~285px) and only visible on the one page pair that
    both differs hugely in height *and* toggles Debug tools' visibility.
  - Verified live (frame-by-frame trace, both directions, before/after):
    max single-frame jump during a Stats<->History transition dropped from
    ~285px (single large snap, old behavior) to ~44px (smooth
    interpolation plus the accepted Debug-tools residual) in a serial
    single-browser run. Covered by
    `e2e/swipe-navigation.spec.ts`'s "Stats <-> History transitions animate
    smoothly in both directions" test (max single-frame footer jump
    threshold, data-driven from these measurements — see the test file's
    own comment for the exact numbers and the reasoning for the threshold
    chosen, including extra margin observed under full parallel-test-run
    CPU contention) and the updated "content below the transitioning tabs
    animates smoothly" test (same threshold, for the pre-existing Shopping
    List<->History case, whose old "zero movement while mounted" assertion
    no longer holds now that height is deliberately animated throughout
    rather than held flat).
- **Stats<->History height animation replaced with a structural fix
  (Debug tools/footer moved outside TabTransition)**: done and verified.
  The previous entry's approach — chasing a smoothly *animated* wrapper
  height inside `TabTransition` (explicit height interpolation,
  `ResizeObserver` re-targeting, `settledTab` gating for Debug tools) — kept
  growing in complexity across several follow-up sessions and still left an
  accepted residual jump. Replaced with a structural fix instead of another
  animation tweak:
  - `TabTransition` now wraps *only* the active page's own content (the
    Shopping List/History/Stats components) — nothing else. All of the
    height-animation machinery (`wrapperRef`/`currentPanelRef` height
    measurement, the `useLayoutEffect` driving the wrapper's `height`
    transition, the `ResizeObserver` re-targeting it) is gone; the
    horizontal slide (CSS Grid overlap, asymmetric enter/exit easing,
    opaque panel backgrounds, stable keys to avoid remounts) is unchanged.
  - `DbDebugPanel` and `Footer` moved out of the transitioning region
    entirely — they're plain siblings in `App.tsx`, below `TabTransition`/
    `TripDetailPage`, same as before this fix (they were already DOM
    siblings; what changed is that `TabTransition` no longer has any
    logic that reaches past its own two panels to affect their layout).
    They still reflow instantly when the active page's height differs
    between tabs (that's an unavoidable consequence of a column-flex
    layout, not something being smoothed over) — no longer animated,
    deliberately: the user asked to stop chasing further animation
    smoothing here and accept a plain, instant reflow instead.
  - Debug tools' Stats-hiding gate moved from `settledTab` (a state that
    lagged `activeTab` until a transition settled, added specifically to
    avoid an extra jump mid-transition) to `activeTab` directly — the same
    plain, instant conditional the tab bar's own highlight already uses.
    `settledTab` and its `onSettle` callback are gone from both
    `TabTransition` and `App.tsx`.
  - `e2e/swipe-navigation.spec.ts`'s two footer-jump-threshold tests
    ("content below the transitioning tabs animates smoothly..." and
    "Stats <-> History transitions animate smoothly...") were removed —
    they encoded the old animated-height contract, which no longer holds
    by design. Replaced with two tests matching the new contract: Debug
    tools/the footer are structurally outside `.gb-tab-slide` throughout a
    transition, and Debug tools hides/shows on Stats with no settle delay.
    Full suite: 69/69 passing.
- **Debug tools removed from History and Stats entirely (root-cause fix,
  superseding the entry above)**: done and verified. The previous entry
  still left a real gap: Debug tools was visible on History (a tab whose
  content height can differ hugely from Stats'), so the footer/Debug-tools
  group still visibly jumped between those two tabs — the entry above only
  eliminated the *animation-smoothing* complexity, not the jump itself.
  Root cause removed instead of continuing to chase layout/positioning
  fixes: Debug tools now only ever renders on the Shopping List tab
  (`activeTab === 'shopping'` in `App.tsx`, replacing `activeTab !==
  'stats'`) — the one tab where trip/receipt data is actively worked with.
  Since it never coexists with History or Stats, there is nothing left for
  it to jump against on those tabs. The footer is unchanged: still visible,
  unconditionally, on all three tabs.
  - Real, non-obvious side effect discovered while updating
    `trip-delete.spec.ts`'s "deleting the trip currently pinned as active
    starts a fresh empty draft" test: that test used the debug panel's
    "Make active" button, from the History tab, to pin a completed trip as
    the active pointer — reachable specifically because `useActiveTripId`
    (which self-heals a pointer aimed at a non-draft trip back to a real
    draft) is only mounted while on the Shopping List tab, so pinning it
    from History let the write "stick". Now that Debug tools only renders
    on Shopping List — the same tab that mounts that hook — clicking "Make
    active" on a non-draft trip there self-heals it right back,
    essentially instantly; there is no longer any tab from which this can
    be done through the UI at all. Fixed the test, not the app (this was
    always a debug-only affordance modeling an edge case unreachable
    through real navigation to begin with — see `deleteTrip`'s doc comment
    in `db.ts`): added a `setActiveTripPointer` helper that pins the
    pointer via a raw IndexedDB write (same technique as this file's
    existing `setTripDate` in `history-improvements.spec.ts` — bypasses
    Dexie's own reactivity, so no live-mounted hook ever observes and
    self-heals the write), then proceeds straight to History/trip-detail
    without ever touching the debug panel for this part of the test.
  - `e2e/history-improvements.spec.ts`'s "with more than 9 trips..." test
    had a `debug-panel-toggle` visibility assertion while on the History
    tab — removed (no longer meaningful), keeping the footer-in-viewport
    assertion.
  - `e2e/swipe-navigation.spec.ts`'s two Debug-tools/footer tests updated:
    the footer-outside-`.gb-tab-slide` test no longer opens/checks the
    debug panel (History has none to check); the settle-timing test now
    covers Debug tools disappearing on *both* History and Stats, not just
    Stats.
  - No layout/positioning code needed changing at all — `TabTransition.tsx`
    and the flex-column layout in `App.tsx` are untouched by this entry;
    only the Debug tools visibility condition and its affected tests
    changed. Full suite: 69/69 passing.
- **History: sticky swapping month header + trip list sized for exactly 9
  rows**: done and verified, two follow-ups on the History trip list
  (`HistoryPage.tsx`).
  - The month header (`<h2 data-testid="history-month-header">`) is now
    `position: sticky; top: 0` instead of scrolling away as ordinary list
    content — the standard CSS-only "swapping section header" pattern
    (contact lists, calendars): every month group already renders its own
    header stacked in normal document order, so giving each one `position:
    sticky` is enough on its own for the pinned label to swap to the next
    month automatically as its group scrolls to the top — no JS scroll
    tracking needed. `background: var(--bg)` (the page background, not
    `--surface`, which is the row cards' color) keeps scrolled-past rows
    from showing through underneath the pinned label, and `zIndex: 1` keeps
    it painting above them (sticky alone doesn't imply paint order).
  - The scroll container's `maxHeight` was wrong: `29rem` (464px) was
    sized assuming *only* 9 rows + 8 gaps, entirely omitting the month
    header's own height, its margin-bottom, and the group wrapper's
    top-margin — that omitted overhead (~49.5px) was silently eating into
    the row budget, so only 8 rows actually fit, leaving a visible gap
    below the 8th row before the footer. Fixed by measuring live (real
    `npm run preview` build, via a temporary Playwright script, not
    guessed): row height 44.375px, row gap 8px, header height 25.5px +
    8px margin-bottom + 16px group top-margin = 49.5px of fixed overhead.
    `maxHeight` is now `32.25rem` (516px) = overhead + 9 rows + 8 gaps
    (512.875px) plus a few px of slack, the same margin style the original
    (wrong) value used.
  - `e2e/history-improvements.spec.ts`'s two boundary tests were
    tightened to actually exercise the boundary — "with 9 or fewer trips,
    no internal scrollbar" seeded only 3 trips before (nowhere near 9,
    so it could never have caught this bug), now seeds exactly 9; "with
    more than 9 trips, scrolls internally" seeded 12 (also fine, but not
    the tight boundary), now seeds 10. Also removed that test's
    now-obsolete `debug-panel-toggle` in-viewport assertion (Debug tools
    doesn't render on History at all anymore — see the entry above).
  - New test: "the pinned month header updates as trips from an earlier
    month scroll into view" — seeds two month groups and scrolls the
    container, checking which header's own rect currently satisfies
    `bottom > containerTop` (i.e., hasn't fully scrolled past yet) rather
    than asserting exact pixel equality against the container's top edge.
    Getting this test right took two live-measured iterations, worth
    remembering if this is touched again: scrolling to the container's
    absolute max (`scrollTop = scrollHeight`) is *not* guaranteed to evict
    the first month's header — if the second month's own group is shorter
    than the container, the total scrollable distance never exceeds the
    first group's height, so there's no scroll position from which it
    could ever be evicted (confirmed live: with only 5 second-month trips,
    this genuinely cannot pass at any scroll position, not a CSS bug).
    Fixed by giving the earlier month enough trips (12) that its own group
    exceeds the container's height. Separately, scrolling to *precisely*
    the first group's measured height lands inside a real, live-measured
    multi-pixel handoff window where the outgoing header is already
    clipped-but-not-fully-gone and the incoming one hasn't reached the top
    yet — neither reads as "current" for a few pixels of scroll. Scrolling
    well past that boundary (+40px margin, not +5px) clears it reliably.
    Full suite: 70/70 passing.
- **Reset all data leaves phantom trips (root cause fixed)**: done and
  verified — this was long-standing (originally reported, never actually
  fixed, back near the footer/README rewrite entry above). Root cause
  confirmed by reproduction (a temporary Playwright script reading
  IndexedDB directly, not guessed): `resetAll` (`DbDebugPanel.tsx`) cleared
  `trips`/`items`/`pendingReceipts`/`appState` as four separate,
  non-transactional `.clear()` calls. The moment `appState` (which holds
  the active-trip pointer) was cleared, every currently-mounted
  `useActiveTripId` consumer — Shopping List, receipt capture, the mascot,
  none of which unmount here since Debug tools only renders on the
  Shopping List tab (see the earlier "Debug tools removed from
  History/Stats" entry) — reactively noticed the pointer disappear and
  self-healed by creating its own replacement draft (the same "never leave
  the app without something to shop into" invariant `deleteTrip`/
  `completeTrip` rely on elsewhere). A module-level guard added in an
  earlier session (`pendingActiveTripCreation` in `db.ts`) already
  prevented multiple *concurrent* self-heals from producing 2 separate
  trips in one wave — confirmed live across 12 serial repro runs, always
  exactly 1 — but nothing prevented that one from happening at all, and
  once created it's a completely ordinary draft, indistinguishable from a
  real one and impossible to clean up after the fact.
  - Presented the two real options to the user rather than picking
    silently, since the original bug's wording ("...instead of zero")
    implied literally zero trips, which turned out to require a much
    larger change: making every `useActiveTripId` consumer tolerate a
    null trip id and deferring creation to an actual user action, instead
    of eagerly self-healing on mount. User chose the smaller, deterministic
    fix instead: make Reset behave exactly like a fresh install (which also
    isn't "zero trips" once bootstrapped) rather than truly empty.
  - Fixed by adding `resetAllData()` (`db.ts`, next to `deleteTrip`): wipes
    all four tables *and* immediately creates and pins one fresh empty
    draft, all inside a single `db.transaction(...)` block. This isn't
    just "fewer calls" — it's what actually closes the race: other
    components' live queries only observe a transaction's effect once it
    commits, so the pointer is never seen "missing" from outside at all —
    it transitions directly from the old trip's id to the new one, which
    `useActiveTripId`'s `resolve()` already treats as an ordinary valid
    draft and returns early on, never calling `getOrCreateActiveTrip()` in
    the first place. `DbDebugPanel.tsx`'s `resetAll` now just calls this
    and refreshes its own display.
  - One test needed updating, not just adding: `active-trip.spec.ts`'s
    existing "reset all data then reload bootstraps exactly one trip, not
    phantom duplicates" asserted 0 trips immediately after clicking
    Reset (true under the old code, since the phantom trip only appeared
    later via the async race) — now genuinely 1 immediately, since the
    fresh draft is created synchronously as part of the same atomic
    action. Updated the assertion rather than leaving it passing for the
    wrong reason.
  - Confirmed live: 15 serial repro repeats each produced exactly one
    trip — a genuinely fresh, empty (0 items) draft — both immediately
    after Reset and again after a full page reload. Also removed the
    now-resolved "still-open... known issue" comment in
    `DbDebugPanel.tsx` that this fix made stale. Full suite: 70/70
    passing.
- **Migrated receipt extraction from Groq to OpenAI**: done. Groq's
  vision model (`qwen/qwen3.6-27b`) is replaced with OpenAI's
  `gpt-4.1-mini`, keeping the same overall flow and JSON contract
  (`{"items": [{"name","price","category","isDiscount"}]}`) the rest of
  the app already relies on.
  - `api/_lib/groqExtract.ts` renamed to `api/_lib/openaiExtract.ts`;
    `GroqHttpError` renamed to `OpenAiHttpError`. Endpoint switched to
    `https://api.openai.com/v1/chat/completions`; `GROQ_API_KEY` renamed
    to `OPENAI_API_KEY` everywhere (`.env.example`, README, Vercel env
    vars).
  - Image is still sent the same way (a `data:image/...;base64,...` data
    URL inside an `image_url` content block) — now with `detail: "high"`
    set explicitly, since receipt line items are small text and the
    default `"auto"` detail level wasn't guaranteed to pick the
    high-resolution path.
  - Error handling was ported, not assumed: OpenAI's real 429 body shape
    (`type: "tokens"`, `code: "rate_limit_exceeded"`, "...Please try again
    in Ns" phrasing) turned out to match what Groq's OpenAI-compatible API
    was already mirroring, so the existing token-limit detection and
    `retryAfter.ts`'s wait-time regex both carried over unchanged. One
    real difference: Groq returned a distinct 400 (`code:
    "json_validate_failed"`) when its own output failed JSON validation
    mid-generation; OpenAI has no such upfront validation — a
    token-limit cutoff only ever shows up as a normal 200 with
    `finish_reason: "length"` and truncated content (a case already
    handled). The 400-truncation branch was removed as dead code for this
    provider rather than left in unreachable.
  - `isGroqTokenLimitError`/`isGroqTruncationError` in `errorMessage.ts`
    renamed to `isOpenAiTokenLimitError`/`isOpenAiTruncationError`; same
    marker-text detection, no behavior change.
  - Updated e2e mocks (`receipt-retry.spec.ts`,
    `receipt-extraction.spec.ts`, `receipt-auto-sync.spec.ts`) to mock
    OpenAI's response/error shapes instead of Groq's — the network
    contract with `/api/extract-receipt` itself (`{ items: [...] }` /
    `{ error: string }` + real HTTP status) didn't change, so only the
    mocked error-body text needed reshaping.
- **Mascot pose expansion (thumbsup/thankyou/excited/onit/error) beyond the
  Shopping List page**: done and verified in production. Until now the
  mascot only existed as the idle/scanning/happy trio tied to receipt
  state, shown in one place (`ReceiptCapture.tsx`). Five new posed source
  images (`thumbsup`, `thankyou`, `excited`, `onit`, `error`, provided by
  the user, same 256×256 RGBA sizing as the existing three) put a mascot on
  every other page too, most of them with no state logic behind them at
  all:
  - `src/features/mascot/useMascotPose.ts`'s `MascotPose` union and
    `src/features/mascot/Mascot.tsx`'s pose→`src` map both extended with
    the 5 new names — `Mascot.tsx` itself needed no other change, it was
    already a dumb `pose -> <img>` lookup.
  - Home (`HomePage.tsx`) swapped its large centered mascot from `idle` to
    `thumbsup`, unconditionally. About (`AboutPage.tsx`) gained one too
    (`thankyou`), same large-centered-under-the-title treatment as Home,
    for visual consistency between the two corner-icon pages. Customize and
    Stats each gained a large centered mascot as a first pass (`excited`
    and `onit` respectively) — later shrunk down, see the follow-up entry
    below.
  - The Shopping List page's own mascot logic gained a 4th, lower-priority
    state: `error`, shown whenever any pending receipt is `status ===
    'failed'`. `useMascotPose` now takes a second boolean parameter
    (`hasFailed`, computed in `ReceiptCapture.tsx` the same way
    `isProcessing` already was — `pendingReceipts.some(...)`) alongside
    `isProcessing`. Priority order is `scanning > happy > error > idle`,
    matching how `scanning`/`happy` already prioritized against each other
    — a failed receipt sitting alongside an in-flight or just-succeeded one
    doesn't cover it up.
  - The 5 new source PNGs were initially added to the project's `MASCOT/`
    source-art directory (same place the original 3 poses' full-res
    sources live) rather than `public/mascot/`, the actual served path —
    copied over before wiring anything up, same as every other pose asset.
  - `e2e/mascot-pose.spec.ts` gained two tests for the new `error` state
    (reusing `receipt-retry.spec.ts`'s "unrecognized 429 message" mock,
    which deterministically lands a receipt in `failed` with no auto-retry
    countdown racing the assertions): one confirming `error` shows while a
    receipt is failed, one confirming `scanning`/`happy` still take
    priority over it when a second receipt is captured and succeeds.
    Capturing a second receipt while a failed one is still in the list
    surfaced a real test-authoring gap in the shared `captureAndProcess`
    helper — the failed row's "Retry" button shares the same testid as the
    new row's "Process" button, so the click needed `.first()` (the
    newest-first sort already guarantees that's the one just captured) to
    avoid a Playwright strict-mode violation once two rows both render one.
    `e2e/home.spec.ts`'s existing pose assertion updated from `idle` to
    `thumbsup`. Full suite: 95/95 passing.
- **Mascot follow-up: small inline icon on Stats/Customize + a 6th pose
  (`receiptfound`) on History**: done and verified in production, based on
  visual feedback on the entry above. The large centered mascot on Stats
  and Customize pushed page content down further than intended, and on
  Customize specifically threatened the page's existing single-screen,
  no-scroll layout for all 11 categories.
  - Stats and Customize both changed from a large (96px) centered mascot
    below the `<h1>` to a small (32px) icon inline with it — the heading
    became a `display: flex, justifyContent: 'space-between'` row with the
    mascot on the right, roughly nav-bar-icon-sized (those default to
    20px) but a bit larger, rather than a page-level illustration. Home and
    About's large centered treatment was left untouched — confirmed still
    correct, not part of this complaint.
  - History (`HistoryPage.tsx`), which had never had a mascot at all, got
    the same small-inline-next-to-title treatment using a new 6th pose,
    `receiptfound` — added to `useMascotPose.ts`'s `MascotPose` union and
    `Mascot.tsx`'s pose map the same way the previous 5 were, with its PNG
    copied from `MASCOT/` into `public/mascot/` the same way too.
  - Verified visually rather than assumed: `browser-harness` (the usual
    visual-verification tool) wasn't installed in this environment and
    setup would have required a fresh clone, so a small one-off Playwright
    script drove `npm run preview` directly at a 390×844 mobile viewport
    instead — screenshotted History/Stats/Customize (confirming the small
    inline icon) and Home/About (confirming no visual change), plus a
    `document.documentElement.scrollHeight <= window.innerHeight` check on
    Customize specifically, which came back true (844px page height in an
    844px viewport) — confirming all 11 categories plus the header row
    still fit with room to spare now that the mascot is smaller. Full
    suite: 95/95 passing (no test changes needed — nothing under test
    asserted the old large-mascot layout).
