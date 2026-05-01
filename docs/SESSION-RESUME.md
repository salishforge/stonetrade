# Session Resume — eBay Integration

Pick this up from any new machine (VPS, workstation, codespace).
Latest update: 2026-05-01.

## Branch & PR

- Branch: `claude/plan-next-steps-PDUPS`
- PR: https://github.com/salishforge/stonetrade/pull/16 (open against `master`)
- Last commit before this note: `chore: ignore sandbox locator files` (`287538c`)

## What's already done

| # | Change | File(s) |
|---|--------|---------|
| 1 | Real OAuth 2.0 Client Credentials flow (in-process token cache, sandbox/prod switch, marketplace switch). The previous client used the App ID directly as a Bearer token — broken. | `src/lib/ebay/client.ts` |
| 2 | Browse API wrapper (active listings) → `EBAY_LISTED` data points | `src/lib/ebay/client.ts` `searchActiveListings` |
| 3 | Marketplace Insights wrapper (sold items) → `EBAY_SOLD` data points. Requires Limited Usage approval. | `src/lib/ebay/client.ts` `searchSoldItems` |
| 4 | Ingestion pipeline: card-list and game-wide sync, idempotent on `ebayListingId`, recomputes `CardMarketValue` for each touched card | `src/lib/ebay/sync.ts` |
| 5 | Admin route — `GET` config probe, `POST` accepts `{ cardIds }` or `{ gameSlug, setCode? }` plus `includeSold`/`perCardLimit` | `src/app/api/admin/ebay-sync/route.ts` |
| 6 | Updated `.env.example` documenting the full keyset and switches | `.env.example` |
| 7 | Setup walkthrough — keyset creation, Marketplace Insights, smoke tests, rate-limit guidance | `docs/EBAY-SETUP.md` |
| 8 | Fixed retired Claude model id in AI price estimator (`claude-sonnet-4-20250514` → `claude-sonnet-4-6`) | `src/lib/ai/price-estimator.ts` |
| 9 | Refreshed PLANNING.md state-snapshot to match what's actually shipped | `PLANNING.md` |

## What's not done

- **Production eBay keys** — only sandbox is configured locally. Get production keys at https://developer.ebay.com/my/keys (Production column). Sandbox returns synthetic data; do not run full ingestion against it.
- **Marketplace Insights approval** — apply at https://developer.ebay.com/develop/apis/restful/buy-marketplace-insights for the `buy.marketplace.insights` scope. Until approved, `includeSold: true` will surface a 403 in `errors[].phase: "sold"` — the active-listing portion still completes.
- **Cron / scheduling** — pipeline exists but isn't wired to anything. Add a daily Vercel Cron (or pg-boss / Inngest job) hitting `POST /api/admin/ebay-sync { gameSlug }` once production keys land.
- **`EBAY_LISTED` weight** — the source enum is wired through, but `src/lib/pricing/constants.ts` `PRICE_WEIGHTS` does not assign a weight to `EBAY_LISTED`. Until added, listed-only data populates breakdowns but doesn't influence the composite `marketMid`. Suggested: `EBAY_LISTED: 0.05`.
- **Auth on the admin route** — `POST /api/admin/ebay-sync` is currently unauthenticated. Same gap as every other admin route in the codebase (auth is mocked in `src/lib/auth.ts`). Real Supabase auth is the larger blocker; this route can stay open until that lands.
- **Tests** — no unit tests for the OAuth caching, pagination, or sync de-duplication logic. Worth adding a fixture-based test for `mapCondition` and the dedup branch.

## Resuming on a fresh machine

```bash
# 1. Clone + branch
git clone git@github.com:salishforge/stonetrade.git
cd stonetrade
git checkout claude/plan-next-steps-PDUPS

# 2. Install + generate Prisma client
npm install
npx prisma generate

# 3. Bring up Postgres (docker-compose.dev.yml runs on :5436)
docker compose -f docker-compose.dev.yml up -d

# 4. Migrate + seed
npx prisma migrate deploy
npm run db:seed

# 5. Create .env.local from .env.local.template — see the env-vars section
cp .env.local.template .env.local
$EDITOR .env.local

# 6. Run dev server
npm run dev
```

## .env.local — required vars

Pull these from your password manager / eBay developer dashboard. **Never commit `.env.local`.**

```env
# eBay — pulled from https://developer.ebay.com/my/keys
EBAY_APP_ID=          # Sandbox keyset → "App ID (Client ID)"
EBAY_CERT_ID=         # Sandbox keyset → "Cert ID (Client Secret)"
EBAY_DEV_ID=          # Sandbox keyset → "Dev ID"  (reserved for Trading API; not used yet)
EBAY_ENV=sandbox      # or "production" once production keys are ready
EBAY_MARKETPLACE_ID=EBAY_US

# Database — local Postgres from docker-compose.dev.yml
DATABASE_URL=postgresql://stonetrade:stonetrade@localhost:5436/stonetrade

# Anthropic — for AI price estimator
ANTHROPIC_API_KEY=

# Wonders CCG platform sibling (default localhost:8001 is fine for dev)
WONDERS_PLATFORM_API_URL=http://localhost:8001
```

The full var list, including future Stripe / Supabase / Resend / Meilisearch additions, is in `.env.example`.

## Smoke tests once env is set

```bash
# (a) Config probe — should report configured + environment
curl http://localhost:3000/api/admin/ebay-sync
# → { "data": { "configured": true, "environment": "sandbox" } }

# (b) Pull active listings for one card (replace <card-id> with any from `npx prisma studio` → Card)
curl -X POST http://localhost:3000/api/admin/ebay-sync \
  -H 'Content-Type: application/json' \
  -d '{"cardIds": ["<card-id>"], "perCardLimit": 5}'
# → { "data": { "cardsScanned": 1, "listedAdded": <n>, "soldAdded": 0, "errors": [] } }

# (c) Idempotency — repeat (b); listedAdded should be 0
```

If `(b)` returns `eBay OAuth failed: 401`, the App ID + Cert ID are not from the same column (sandbox vs production) or `EBAY_ENV` doesn't match. Double-check both.

If `(b)` returns successfully but with `listedAdded: 0` and no errors against a sandbox keyset, that's expected — sandbox returns sparse synthetic results. Re-run against production keys for a real test.

## Next concrete actions

1. Apply for Marketplace Insights (sold-data) on the eBay developer dashboard.
2. Generate production keys; add to `.env.local` on staging/prod hosts (not on dev).
3. Add `EBAY_LISTED: 0.05` to `PRICE_WEIGHTS` in `src/lib/pricing/constants.ts` once you've eyeballed a few sandbox/production runs and confirmed listed prices look reasonable.
4. Schedule a daily run: cron job → `POST /api/admin/ebay-sync { gameSlug: "wonders-of-the-first" }`.
5. Move on to either (a) replacing the mocked `getCurrentUser` in `src/lib/auth.ts` with real Supabase auth, or (b) starting the PLANNING.md Phase-2 extensions (`CardEngineMetrics`, volatility tier, listing coach).
