# Production Readiness — Baseline

**Status:** baseline as of master `efaf4e4` · 2026-07
**Owner:** TBD
**Companion docs:** `differentiation-strategy.md`, `mystery-packs.md`, `deck-bundles.md`, `peer-consensus-listings.md`

This is the state-of-the-world checkpoint that the next round of improvements
starts from. It records **what is done**, **what the confirmed deployment
decisions are**, and **the prioritised backlog** so work can resume without
re-deriving context.

---

## Confirmed deployment decisions

| Decision | Choice |
|---|---|
| **Host** | Self-hosted Docker (own box; `next.config.ts` already allows the Tailscale + public IP dev origins) |
| **Card data & images** | Deploy the sibling Wonders CCG platform in prod; marketplace syncs card identity + engine metrics + images from it |
| **Auth** | Supabase (wired on master; needs prod config + admin bootstrap) |
| **Payments** | Stripe Connect (Express accounts), live keys + webhook to configure |

---

## What's shipped (on master)

### Security & correctness — `#21` (hardening pass)
- `AUTH_MODE` **fail-closed in production**: `getAuthMode()` throws if
  `NODE_ENV=production` and `AUTH_MODE` isn't explicitly set (no more silent
  dev-user fallback).
- **Open-redirect fixed** on `/auth/callback` via `resolveSafeNext()`.
- **Admin/cron gates** on `/api/prices/recalculate`, `/api/polls` (POST),
  `/api/admin/ebay-sync` (the last via the shared `authorize()` helper that
  also covers GET).
- **Ownership check** on `/api/collections/[id]/export` (owner or `isPublic`).
- **Order creation** rebuilt as a transaction: `SELECT … FOR UPDATE` +
  outstanding-`PENDING_PAYMENT` accounting (no oversell race), `decimal.js`
  money math, shipping-method snapshot (reject unknown methods, no $0
  fallback).
- **Stripe checkout** uses the order's snapshotted subtotal (not the live
  listing price) as a single line item; cents via banker's-rounding
  `toCents()`.
- **Refund idempotency key**, **constant-time `CRON_TOKEN`** compare,
  **Zod-validated AI estimator** response, **`safeFetch()`** (timeout +
  size cap) across the eBay / Cardeio / platform clients.

### Ops foundation — `#22` (health + env)
- `GET /api/health` — DB ping → 200/`ok` or 503/`down`; surfaces env
  *warnings* (never secret values); re-validates env each call.
- `src/lib/env.ts` — pure `validateEnv()` + `assertEnv()`; boot-time
  validation via `src/instrumentation.ts` refuses to start production with a
  missing/invalid required var (`DATABASE_URL`, `NEXT_PUBLIC_APP_URL`,
  explicit `AUTH_MODE`, Supabase keys when `AUTH_MODE=supabase`).
- `.env.example` — the three previously-undocumented vars added
  (`NEXT_PUBLIC_APP_URL`, `WONDERS_DECK_PLATFORM_API_URL`,
  `WONDERSTRADINGPOST_ANON_KEY`).

### CI hygiene — `#19`, `#23`
- CI (`verify`: tsc + lint + test + build) fires on PRs to master/main.
- Scheduled crons (`recompute-stale`, `evaluate-alerts`) **skip gracefully**
  (exit 0 + `::warning::`) when their secrets are unset, instead of failing
  every run pre-deploy.

### Differentiation — `#15`, `#20`
- Card-movement **attribution panel** + **meta-shift alert UI** (#15).
- **Mystery Packs Phase 1** — schema, `tiers` validators, floor/EV math,
  `RESERVED_FOR_PACK` status, tests (#20).

---

## Integration readiness matrix

| Integration | Code state | To go live |
|---|---|---|
| **Stripe / Connect** | Production-ready | Live keys; webhook endpoint + `STRIPE_WEBHOOK_SECRET`; Connect platform profile; one live test txn |
| **Supabase Auth** | Wired | `AUTH_MODE=supabase` + keys; register prod OAuth redirect + site URLs; **admin bootstrap** (no path exists yet) |
| **Email (Resend)** | Gated no-op | `RESEND_API_KEY`; verify sending domain (DKIM/SPF); set `RESEND_FROM_ADDRESS` |
| **Notifications (Novu)** | Lazy-init, safe | `NOVU_API_KEY` + app id; `novu sync` to push the 7 workflows; Resend integration in Novu |
| **Wonders platform** | Soft dependency | Deploy sibling service; set `WONDERS_PLATFORM_API_URL` / `_DECK_` / `_IMAGE_BASE_URL`; `safeFetch` timeouts in place |
| **Price ingestors** | Wired (eBay, PriceCharting, WondersTradingPost) | Per-source creds; all admin/cron-triggered |
| **AI estimator** | Zod-validated | `ANTHROPIC_API_KEY` |
| **Cron jobs** | Wired + fail-safe | `STONETRADE_BASE_URL` + `STONETRADE_CRON_TOKEN` GH secrets; `CRON_TOKEN` on host |

---

## Next-round backlog

### P0 — remaining launch blockers
1. **Dockerfile + release pipeline** — `output: "standalone"`, multi-stage
   Dockerfile, `prisma migrate deploy` on release, `HEALTHCHECK` → `/api/health`.
   Supabase Postgres needs pooled `DATABASE_URL` (:6543) **and** `DIRECT_URL`
   (:5432) for migrations.
2. **Admin bootstrap** — `scripts/set-admin.ts` (or documented SQL). No path
   to a first admin exists today.
3. **Security headers** — none in `next.config.ts`. Add HSTS,
   X-Frame-Options/frame-ancestors, X-Content-Type-Options, Referrer-Policy,
   CSP (report-only first). Add `images.remotePatterns` for the prod image host.
4. **Error tracking** — wire Sentry via `instrumentation.ts` `onRequestError`
   (~28 raw `console.*` calls today = invisible prod errors).
5. **Deploy the Wonders platform** + pre-sync card data & images.
6. **Go-live config** — set all real secrets; run the env validator against
   the prod env; one end-to-end live Stripe transaction.

### P1 — beta quality
- **Rate limiting** (deferred from #21) — auth, search, polls/votes, offers,
  sale-reports, checkout. Upstash Ratelimit fits self-host + serverless.
- **Supabase RLS** (deferred from #21) — per-table policies as defense in
  depth behind the app-layer checks.
- **safeFetch** into the WondersTradingPost client (still no timeout).
- **Legal** — ToS, Privacy Policy, seller/marketplace agreement, refund/dispute
  policy.
- **Beta scope cut** — hide Mystery Packs (no UI yet) and Trades (schema only);
  confirm the live funnel (browse → card → listing → checkout → order; sell;
  collection/buylist/alerts; polls/report-sale).

### P2 — fast-follow
- Structured logging + dashboards (checkout success, webhook failures).
- Supabase backup/restore drill + migration rollback runbook.
- Meilisearch if ILIKE search outgrows itself (env already documented, unused).
- `force-dynamic` performance pass (root layout does a `getCurrentUser()` DB
  hit per render).

### Differentiation (parallel track)
- **Mystery Packs Phase 2** (builder UI) → **Phase 3** (buyer surface) — the
  next wedge feature; foundation is in.
- Deck bundles, peer-consensus listings — still `OUTLINE` (see their docs).

---

## How to resume

Master is the clean baseline. Branch per unit of work off `master`, PR with
green `verify`, merge. The `Supabase Preview` check reporting `skipped` on
every PR is expected (no `supabase/` dir changes) — not a failure. The
combined commit-status may show yellow because of it; the merge isn't blocked.
