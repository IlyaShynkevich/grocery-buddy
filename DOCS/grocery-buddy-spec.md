# Grocery Buddy — Concept Spec (v1 handoff doc)

## What this is
A personal, mobile-first grocery budget tracker. Single user, no accounts/auth needed for v1 (just for me, running locally/personally — not deployed publicly yet).

## Core problem it solves
I don't have visibility into *what* I'm actually spending my grocery money on, category by category, so I can't easily spot where to cut back (e.g. snacks, drinks) vs. what's essential.

## The user flow

1. **In the store**: I build a running shopping list as I pick up items — typed in, item by item (e.g. "milk", "bread"). No price yet, no photo needed at this stage.
2. **At checkout**: I pay, get a receipt, and take a photo of it in the app.
3. **Receipt processing**: the photo is sent to an LLM (vision-capable) which extracts a structured list of items + prices from the receipt, and suggests a category for each item (e.g. produce, snacks, dairy, household). I can review and override any category before saving.
4. **Session saved**: this shopping trip is stored as a "session" — date, store (optional), list of items with price + category, and total.
5. **History view**: I can open any past date and see exactly what I bought and where the money went that day.
6. **Monthly statistics**: at the end of the month (or on demand), I get a breakdown of spending by category, trends vs. previous months, and a flag on "non-essential" categories (snacks, drinks, etc.) so I can see if I'm overspending on things I don't need — with the goal of nudging better habits over time.

## Suggested build order (v1 → v2)

**v1 (build first):**
- Typed shopping list (no photo/OCR for this part — not worth the complexity yet)
- Receipt photo → LLM extraction → structured items (name, price, suggested category)
- Manual override of category before saving
- Session storage (date, items, total)
- History view by date
- Basic monthly stats: total spend, spend by category

**v2 (later, once v1 is actually in use):**
- Trends over time / month-to-month comparison
- Smarter essential vs. non-essential flagging and personalized nudges
- Optional: photo-based item recognition while shopping (harder problem, lower payoff — only worth it if v1's typed list feels like friction in practice)
- Optional: store-level tracking (price comparison across stores)
- Visual identity / mascot: a small, minimalistic creature (similar spirit to Claude's own interface mascot) as the app icon and an in-app presence. Should appear specifically during the AI-driven moments — receipt scanning/extraction, maybe reacting to monthly stats — so the AI feels present rather than invisible. Include subtle motion/animation (not static), matching how Claude's mascot behaves. This is a design/polish pass to revisit once core functionality (M0-M8) is working and in daily use — not before.

## Suggested tech shape (for Claude Code to refine)
- **Platform**: PWA (installable web app) rather than native iOS/Android — much lighter to build/iterate solo, still gives home-screen install + camera access + offline capability. Add to home screen via browser once; no app store.
- **Frontend**: React.
- **AI provider**: OpenAI API — `gpt-4.1-mini`, a vision-capable model that can do OCR-style extraction from a receipt photo at low per-request cost. Note: double-check the chosen model is still current/available when revisiting this.
- **Storage**: local-first (e.g. local DB / simple file storage) is enough for a single-user personal tool; no auth needed unless it's later shared/deployed.

## Offline behavior (important — design in from the start, not bolted on later)
- Typing the shopping list and taking the receipt photo must both work with no connection — save locally via the service worker / local storage.
- A receipt photo taken offline goes into a **pending queue** (visibly marked "waiting to process") rather than failing or blocking the user.
- Once connectivity returns, queued receipt photos are automatically sent to OpenAI for extraction (items, prices, categories).
- The typed shopping list is optional, not required: if the user skips typing items in-store, the receipt scan alone is sufficient to populate a full session — the AI fills in whatever wasn't manually entered, and the user just reviews/corrects afterward rather than starting from scratch.

## Data model sketch
```
ShoppingTrip
- id
- date
- store (optional, freeform text)
- items: [ShoppingItem]
- total

ShoppingItem
- name
- price
- category (essential / non-essential subtype, user-overridable)
```

## Open questions for Claude Code's plan mode to work through
- Exact tech stack (frontend framework, storage choice, which LLM provider/SDK)
- Receipt photo handling: local file vs. base64 inline to the API
- Category taxonomy: fixed list vs. freeform AI-suggested categories
- Offline behavior if no connection at checkout
