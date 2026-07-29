# Grocery Buddy

Personal, mobile-first grocery budget tracker. Single-user, no auth. See
[`DOCS/grocery-buddy-spec.md`](DOCS/grocery-buddy-spec.md) for the full concept
and data model.

Stack: React + Vite + TypeScript, installable as a PWA, IndexedDB (Dexie) for
local-first storage, Groq (vision model) for receipt extraction via a Vercel
serverless function, deployed on Vercel.

## Development

```bash
npm install
npm run dev
```

## Environment variables

`GROQ_API_KEY` is required once the receipt-extraction feature lands (see
`api/extract-receipt.ts`). It needs to be set in **two separate places** —
they don't share values:

- **Local dev**: copy `.env.example` to `.env.local` and fill in the key.
  `.env.local` is gitignored and only affects your machine.
- **Deployed (Vercel)**: add `GROQ_API_KEY` in the Vercel dashboard under
  **Project → Settings → Environment Variables** (set it for both
  Production and Preview). Vercel does **not** read `.env.local` — if the
  key is only in `.env.local`, the deployed app's serverless function will
  fail with an auth error even though local dev works fine.

Do this **before** the first deploy that calls the extraction endpoint,
otherwise that deploy will be broken until the dashboard variable is added
and the function redeployed.

## Build

```bash
npm run build
npm run preview
```
