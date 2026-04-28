# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What
StoneTrade — community-driven marketplace and price-discovery platform for emerging CCGs (Wonders of the First, Bo Jackson Battle Arena). Single Next.js app; no separate API service.

See `CCG-MARKETPLACE-SPEC.md`, `WONDERS-PLATFORM-REQUIREMENTS.md`, and `PLANNING.md` for product spec, integration contract, and roadmap.

## Stack
- Next.js 16 (App Router, turbopack), React 19, TypeScript strict
- Tailwind CSS 4, shadcn/ui (`base-nova` style, neutral base color), lucide icons
- PostgreSQL (Supabase in prod, local Docker in dev) via Prisma 7 + `@prisma/adapter-pg`
- Supabase Auth — **not yet wired** (see Auth section)
- Stripe Connect for split payments, Resend for email, Anthropic SDK for AI features
- Meilisearch and Supabase Realtime per spec; not yet integrated

## ⚠️ Next.js 16
Per `AGENTS.md`: this is **not** the Next.js in your training data — APIs and conventions may differ. Read `node_modules/next/dist/docs/` for the relevant guide before writing route handlers, middleware, server actions, or `next.config.ts` changes. Heed deprecation notices.

## Commands
```bash
docker compose -f docker-compose.dev.yml up -d   # Local Postgres on :5436
npx prisma migrate dev                           # Apply migrations
npm run db:seed                                  # Seed WoTF + BJBA card data
npm run dev                                      # Dev server (turbopack)
npm run build && npm start                       # Production build/run
npm run lint                                     # ESLint (next core-web-vitals + ts)
npm run db:studio                                # Prisma Studio
npm run db:reset                                 # Drop + recreate + seed
```
No test runner is configured yet. There is no `typecheck` script — run `npx tsc --noEmit` if you need one.

## Architecture

**Routing.** App Router with route groups (no path segment): `(auth)`, `(marketplace)`, `(dashboard)`, `(seller)`, `(discovery)`. API routes under `src/app/api/{cards,listings,offers,orders,buylists,collections,polls,prices,stripe,admin}/`. Response shape: `{ data: ... }` or `{ error: "..." }` with appropriate HTTP status. Validate inputs with Zod (`src/lib/validators/`).

**Database.** Prisma client is generated to `src/generated/prisma/` (custom output path) — import from `@/lib/prisma`, never the generated path directly. Connection uses `PrismaPg` adapter, not the default driver. Prices are `Decimal(10,2)`; use `decimal.js` for arithmetic. Schema models the full marketplace: `Game/Set/Card`, price discovery (`PriceDataPoint`, `CardMarketValue`, `ValuePoll`, `SaleReport`), trading (`Listing`, `MysteryPack`, `Offer`, `Order`), and ownership (`Collection`, `Buylist`, `User`). Card uniqueness is `(setId, cardNumber, treatment)`.

**Pricing engine** (`src/lib/pricing/`). `CardMarketValue.{marketLow,marketMid,marketHigh}` is computed from `PriceDataPoint` rows aggregated across multiple `PriceSource`s (eBay sold, completed sales, listings, polls, buylist, manual reports, AI estimate) using:
- per-source weights and time-decay (`constants.ts`)
- outlier rejection by std-dev (`composite-value.ts`)
- weighted percentiles for low/mid/high
- `confidence-score.ts` produces a 0–100 score driven by data-point count and source diversity

When changing the pricing math, update `recalculate.ts` (the entry point hit by `api/prices/recalculate`) and re-seed before testing — the values cache in `CardMarketValue`.

**Auth (current state).** `src/lib/auth.ts#getCurrentUser` returns a mock `dev-user`, auto-created on first call. Supabase wiring exists in `src/lib/supabase/{client,server}.ts` but the route handlers still call `getCurrentUser()`. When swapping to real auth, replace the body of `getCurrentUser` — callers don't change.

**Sibling project integration.** Card gameplay data (404 cards, decklists, AI opponents) lives in the Wonders CCG platform at `projects/wonders/wonders-ccg-platform/`, exposed on `localhost:8001`. StoneTrade syncs via HTTP — see `src/lib/platform/{client,sync,mapper}.ts`. **No shared database**; the platform is a data source, not a dependency. `WONDERS_PLATFORM_API_URL` configures the base URL.

**Other integrations** (`src/lib/`): `stripe.ts` (Connect, marketplace payments), `cardeio/` (planned partnership), `ebay/` (eBay sold-listings ingest), `ai/price-estimator.ts` (Anthropic-backed estimates feeding `AI_ESTIMATE` price source).

## Conventions
- Imports use `@/*` alias mapped to `src/*`.
- shadcn components live in `src/components/ui/` — extend, don't fork.
- All money-handling code uses `Decimal`; never `Number` arithmetic on prices.
- Mobile-first responsive design per `CCG-MARKETPLACE-SPEC.md`.
- Seed data is authoritative for set/card identity in dev — re-seed after schema changes rather than hand-editing rows.
