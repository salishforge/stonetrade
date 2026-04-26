# Wonders CCG Platform — Marketplace Integration Requirements

> Forward-looking requirements document for the sibling **`wonders-ccg-platform`** project (referenced in `CLAUDE.md` as `../wonders-ccg-platform/`, served at `WONDERS_PLATFORM_API_URL`, default `http://localhost:8001`). The repo is not yet on GitHub at the time of writing; this document specifies what the platform must expose for StoneTrade's price-discovery vision (per `PLANNING.md`) to function.

---

## 0. Scope and Audience

**This is a consumer-facing requirements document, written from the marketplace's perspective.** It does not prescribe internal platform implementation — only the contract surface (HTTP endpoints, payload shapes, webhook semantics, auth model) the marketplace depends on.

The platform team is the source of truth for game rules, deck-builder logic, and tournament scoring. The marketplace consumes the platform's data products to power price discovery.

---

## 1. Current Integration State (Already Implemented in StoneTrade)

| Component | Path | Purpose |
|-----------|------|---------|
| HTTP client | `src/lib/platform/client.ts` | Thin fetch wrapper with `BASE_URL = WONDERS_PLATFORM_API_URL` |
| Type definitions | `src/types/platform.ts` | `PlatformCardData`, `PlatformCardSearchParams`, treatment constants |
| Card mapper | `src/lib/platform/mapper.ts` | Maps `PlatformCardData` → marketplace `Card` (×5 treatments per base card) |
| Sync runner | `src/lib/platform/sync.ts` | Manual full-sync of cards into marketplace DB |

### 1.1 Endpoints currently consumed

```
GET  /api/v1/cards                    — search with optional filter params
GET  /api/v1/cards/:cardNumber        — single card lookup
POST /api/v1/cards/batch              — body: { card_numbers: string[] }
```

### 1.2 `PlatformCardData` fields currently consumed

```ts
{
  card_number: string;
  name: string;
  card_type: string;        // "Wonder" | "Land" | "Spell" | "Item"
  power: number | null;
  cost: number;
  orbital: string | null;
  tier: string;             // "Legendary" | "Primary" | "Secondary"
  rarity: string;           // "common" | "uncommon" | "rare" | "epic" | "mythic" | "T"
  abilities: string[] | null;
  parsed_abilities: Record<string, unknown>[] | null;
  synergies: string[];      // flat array of related cardNumbers — needs strength scores (see §2.6)
  counters: string[];
  dbs_score: number | null;
  set_name: string | null;
  release_date: string | null;
  classes: string[];
  faction: string | null;
  is_core: boolean;
  is_equipment: boolean;
  is_token: boolean;
}
```

### 1.3 Known limitations of the current contract

- **No authentication** — `client.ts` performs anonymous fetches. Adequate for local dev; not viable for production.
- **No pagination metadata** — `searchCards` infers "more results" from `batch.length < batchSize`. Brittle if the platform changes default page sizes.
- **No versioning beyond `/v1/`** — no schema version header, no deprecation signal.
- **Synergies are unweighted** — a flat array means we can't rank or threshold.
- **No deck/tournament/meta data exposed** — only static card facts.
- **No event push** — marketplace must poll. Acceptable for cards (they change rarely); not acceptable for tournament results or meta shifts.
- **No bulk sync efficiency** — `fetchAllCards` paginates one batch at a time. A `Last-Modified` / `If-Modified-Since` or `since=<timestamp>` parameter would dramatically reduce re-sync cost.

---

## 2. New Endpoints Required

### 2.1 Deck Statistics (Required for PRI, Phase 2)

These are the most consequential additions — they unblock the engine-driven price-signal vision.

#### `GET /api/v1/cards/:cardNumber/deck-stats`

Query params:
- `format` *(optional)* — "standard" | "limited" | etc.
- `period` *(optional)* — "7d" | "30d" | "90d"; default "30d"
- `min_decks` *(optional)* — minimum sample size required to return non-null stats; default 20

Response:
```json
{
  "card_number": "012/401",
  "format": "standard",
  "period_start": "2026-03-26T00:00:00Z",
  "period_end": "2026-04-25T00:00:00Z",
  "deck_count_total": 1842,
  "deck_count_including": 521,
  "inclusion_pct": 28.28,
  "avg_copies": 2.7,
  "win_rate_when_included": 0.567,
  "win_rate_baseline": 0.502,
  "replacement_rate": 0.18,
  "sample_confidence": 0.91
}
```

**Notes:**
- `replacement_rate` = fraction of decks that, when this card was removed in a sibling decklist, kept their win rate within 1% (i.e., the card was easily substitutable).
- `sample_confidence` is a 0–1 scalar reflecting whether `deck_count_total` is large enough that the marketplace should trust these numbers.
- Return 200 with all metrics `null` if `deck_count_total < min_decks` — don't return 404.

#### `GET /api/v1/decks/meta`

Query params: `format`, `period`, `top_n` (default 20)

Response:
```json
{
  "format": "standard",
  "period": "30d",
  "archetypes": [
    { "name": "Petraia Aggro", "share_pct": 18.4, "win_rate": 0.541, "signature_cards": ["007/401", "023/401"] }
  ],
  "top_decks": [
    {
      "deck_id": "deck_xyz",
      "name": "Top 8 — SCG CON Orlando",
      "archetype": "Petraia Aggro",
      "finish": "1st",
      "event_id": "evt_orlando_2026_03",
      "event_name": "SCG CON Orlando",
      "event_date": "2026-03-22",
      "player": "...",
      "main_deck": [{ "card_number": "012/401", "qty": 4 }],
      "sideboard": []
    }
  ]
}
```

#### `GET /api/v1/decks/:deck_id`

Returns a single deck (for deep-link rendering of "build this deck for $X" pages).

#### `POST /api/v1/decks/cost-quote-source`

*Note: the marketplace prices the cards; the platform doesn't. But the platform should expose a normalized **decklist** representation that the marketplace can consume to compute cost quotes.*

The marketplace already does the cost computation. This endpoint is only needed if the platform wants to render its own cost-aware UI, in which case the contract is reversed — see §4.

### 2.2 Power Rating Index Source (Optional — Phase 2)

If the platform decides to compute PRI itself rather than the marketplace deriving it from §2.1 inputs:

#### `GET /api/v1/cards/:cardNumber/pri`

Query params: `format`, `period`

Response:
```json
{
  "card_number": "012/401",
  "pri": 78,
  "confidence": 84,
  "format": "standard",
  "period": "30d",
  "computed_at": "2026-04-25T12:00:00Z",
  "inputs": {
    "deck_inclusion_pct": 28.28,
    "win_rate_when_included": 0.567,
    "dbs_score": 87,
    "avg_copies": 2.7,
    "replacement_rate": 0.18
  },
  "weights_used": {
    "deck_inclusion": 0.35,
    "win_rate": 0.25,
    "dbs_score": 0.20,
    "avg_copies": 0.10,
    "replacement_rate": 0.10
  }
}
```

**Recommendation:** The marketplace should compute PRI itself initially (using §2.1 inputs) so we control the weighting and can iterate quickly. Promote PRI computation to the platform **only** if multiple consumers (deck builder, marketplace, third-parties) need a shared canonical value.

### 2.3 Role Classification (Phase 4)

#### `GET /api/v1/cards/:cardNumber/roles`

Response:
```json
{
  "card_number": "012/401",
  "format": "standard",
  "period": "30d",
  "roles": [
    { "role": "win_condition", "confidence": 91 },
    { "role": "combo_piece", "confidence": 64 }
  ],
  "reasoning": "Appears as 1-2x in 78% of finals decks; co-occurs with [023/401] in 88% of those decks."
}
```

Valid `role` values must match the marketplace's `CardRole` enum: `staple` | `tech` | `win_condition` | `combo_piece` | `filler` | `unclassified`.

### 2.4 Tournament Results Feed (Phase 4)

#### `GET /api/v1/tournaments`

Query params: `since` (ISO timestamp), `format`, `limit` (default 50, max 200)

Response:
```json
{
  "events": [
    {
      "event_id": "evt_orlando_2026_03",
      "name": "SCG CON Orlando",
      "format": "standard",
      "date": "2026-03-22",
      "player_count": 248,
      "finished_at": "2026-03-22T22:45:00Z",
      "tier": "premier"
    }
  ],
  "next_cursor": "..."
}
```

#### `GET /api/v1/tournaments/:event_id/decks`

Returns all submitted/finishing decks (or a configurable top-N) with full decklists.

### 2.5 Meta-Shift Detection (Phase 4)

The platform is best positioned to detect significant changes in card usage. Two delivery options:

**Pull endpoint:**
#### `GET /api/v1/meta/shifts`
Query params: `since`, `min_magnitude` (default 0.10 = 10% inclusion change), `format`

Response:
```json
{
  "shifts": [
    {
      "card_number": "012/401",
      "format": "standard",
      "shift_type": "inclusion_up",
      "prior_period": { "start": "2026-03-19", "end": "2026-03-26", "inclusion_pct": 12.0 },
      "current_period": { "start": "2026-04-19", "end": "2026-04-26", "inclusion_pct": 28.3 },
      "magnitude": 0.136,
      "likely_cause": "Top 8 finish at SCG CON Orlando 2026-03-22"
    }
  ]
}
```

**Push (preferred for low latency):** see §3.1 webhook spec.

### 2.6 Synergy Graph with Strength (Phase 4)

The current `PlatformCardData.synergies: string[]` is unweighted. Replace or augment with:

#### `GET /api/v1/cards/:cardNumber/synergies`

Response:
```json
{
  "card_number": "012/401",
  "synergies": [
    {
      "card_number": "023/401",
      "strength": 0.91,
      "co_occurrence_rate": 0.87,
      "reasoning": "Co-played in 87% of decks featuring 012/401; combined win rate +6.2% vs baseline."
    }
  ],
  "counters": [
    { "card_number": "055/401", "strength": 0.74 }
  ]
}
```

#### `GET /api/v1/synergies/bundles`

Query params: `seed` (card_number), `max_items` (default 5), `format`

Returns recommended card groupings for the engine-driven synergy bundle feature.

### 2.7 Bulk-Diff Sync (Phase 2 — Performance)

#### `GET /api/v1/cards/changes`

Query params: `since` (required, ISO timestamp), `limit`, `cursor`

Returns only cards modified since the given timestamp. Replaces full-table scans for routine sync.

Response includes `tombstones` for removed/retired cards:
```json
{
  "changed": [ { "...PlatformCardData": "..." } ],
  "removed": [ { "card_number": "099/401", "removed_at": "..." } ],
  "next_cursor": "..."
}
```

---

## 3. Webhook Surface

### 3.1 Webhook Catalog

The marketplace will register a single webhook receiver URL with a shared secret. The platform delivers signed POSTs to that URL on the following events:

| Event | Trigger | Payload Summary |
|-------|---------|------------------|
| `card.updated` | Card data changed (rules text, image, etc.) | `{ card_number, fields_changed, before, after }` |
| `card.retired` | Card removed/banned | `{ card_number, retired_at, reason }` |
| `tournament.completed` | Tournament finalized | `{ event_id, format, finished_at, top8_card_numbers }` |
| `meta_shift.detected` | Significant inclusion/win-rate shift | (see §2.5 payload) |
| `card_role.updated` | Role classification changed | `{ card_number, format, prior_roles, new_roles }` |

All webhook payloads include a `delivery_id`, `event_type`, `delivered_at`, and `signature` (HMAC-SHA256 of the body using the shared secret).

### 3.2 Marketplace Receiver

Proposed location: `src/app/api/webhooks/platform/route.ts` (does not exist yet — to be created with the first webhook integration in Phase 4).

Receiver responsibilities:
- Verify HMAC signature; reject on mismatch.
- Persist raw payload to a `WebhookDelivery` table for audit and replay.
- Enqueue a job to apply the change idempotently (the marketplace should tolerate duplicate deliveries).
- Acknowledge with HTTP 200 within 3 seconds.

### 3.3 Idempotency and Replay

- Every webhook carries a unique `delivery_id`.
- The marketplace persists `delivery_id`s for 30 days; duplicates are ignored.
- The platform should support manual replay: `POST /api/v1/webhooks/replay { delivery_id, target_url }`.

---

## 4. Authentication & Authorization

### 4.1 Required Auth Modes

| Direction | Mechanism | Used For |
|-----------|-----------|----------|
| Marketplace → Platform (server-to-server) | API key via `X-Platform-Api-Key` header | All `/api/v1/*` calls except those explicitly marked public |
| Platform → Marketplace (webhooks) | HMAC-SHA256 of body with shared secret in `X-Platform-Signature` header | All webhook deliveries |
| User → Platform (linked identity) | OAuth2 PKCE flow; access token from platform exchanged for marketplace session | Cross-service identity (see §5) |

### 4.2 Environment Variables (Marketplace Side)

Append to `.env.example`:
```env
WONDERS_PLATFORM_API_URL=http://localhost:8001
WONDERS_PLATFORM_API_KEY=               # server-to-server, never client-exposed
WONDERS_PLATFORM_WEBHOOK_SECRET=        # shared HMAC secret
WONDERS_PLATFORM_OAUTH_CLIENT_ID=       # for user-identity linking
WONDERS_PLATFORM_OAUTH_CLIENT_SECRET=
WONDERS_PLATFORM_OAUTH_REDIRECT_URI=
```

### 4.3 Client.ts Refactor

Update `src/lib/platform/client.ts`:
```ts
async function fetchApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const apiKey = process.env.WONDERS_PLATFORM_API_KEY;
  const headers = new Headers(init.headers);
  if (apiKey) headers.set("X-Platform-Api-Key", apiKey);
  headers.set("Accept", "application/json");
  // ... rest as today
}
```

Non-breaking — anonymous calls continue to work for endpoints the platform marks public (e.g., a future public card data API).

---

## 5. Cross-Service Identity

The marketplace's `User` model already has `cardeioPlayerId`. If `wonders-ccg-platform` is a distinct identity provider, add a parallel field:

```prisma
// in User model
platformUserId  String?  @unique
platformOauthRefreshToken  String?  // encrypted at rest
```

### 5.1 Linking Flow

1. User clicks "Connect Wonders Account" on `/dashboard/settings`.
2. Marketplace redirects to platform's `/oauth/authorize` (PKCE).
3. Platform redirects back with code → marketplace exchanges for access + refresh token.
4. Marketplace persists `platformUserId` and the encrypted refresh token.
5. Linked: marketplace can now show the user's collection-from-platform, deck history, tournament results.

### 5.2 Reverse-Linking

The platform should expose a deep link the marketplace can use to render "View on Wonders" links: `https://wonders.example/users/:platformUserId/decks/:deckId`.

---

## 6. Versioning, Deprecation, Schema Drift

### 6.1 Versioning Strategy

- Path-based major version (`/api/v1/`, `/api/v2/`).
- Within a major version, additive changes are non-breaking. New fields may appear; existing fields cannot disappear or change type.
- Removing a field requires a 60-day deprecation window with `Deprecation` and `Sunset` HTTP response headers naming the next field.

### 6.2 Schema Hash Header

Every response includes `X-Platform-Schema-Hash: <sha256>` covering the schema version of `PlatformCardData`. The marketplace caches this; on change, the marketplace reruns full sync.

### 6.3 Health and Schema Discovery

#### `GET /api/v1/health`
Returns service health: `{ status: "ok" | "degraded", uptime_s: ..., version: "..." }`

#### `GET /api/v1/schema`
Returns the OpenAPI 3.1 specification for the platform's API. Lets the marketplace generate types automatically (`openapi-typescript` is a candidate dependency).

---

## 7. Local Development

### 7.1 docker-compose Entry

The marketplace's `docker-compose.dev.yml` should be augmented with a platform service entry once the platform repo exists:

```yaml
services:
  platform:
    image: salishforge/wonders-ccg-platform:dev
    ports:
      - "8001:8001"
    environment:
      DATABASE_URL: "..."
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8001/api/v1/health"]
      interval: 30s
```

### 7.2 Mock Platform for CI / Offline Dev

Until the platform service is reliably available in CI, ship a mock implementation:

- `src/lib/platform/__mocks__/client.ts` — in-memory fixtures keyed by `WoTF_FIXTURE_SET`
- Fixture: a 50-card subset of the Existence set with realistic deck-stats payloads
- Tests use the mock by default; a `PLATFORM_INTEGRATION=true` env var swaps to the real client

### 7.3 Contract Tests

Add a contract test suite (e.g., Pact, or a simple JSON-schema-validated set of recorded responses) that runs against a real platform instance nightly. Failures alert both teams to a contract drift.

---

## 8. Performance and Limits

### 8.1 Expected Marketplace Load

- **Card search:** O(100) requests/min during browse-heavy hours; mostly cacheable.
- **Deck stats:** O(1000) requests/day during Phase 2+; heavily cached (15-minute TTL acceptable).
- **Bulk sync:** once daily, prefer `/cards/changes?since=...` (§2.7) over full pagination.
- **Webhook deliveries:** O(10) events/day at first; spikes around tournament conclusions.

### 8.2 Response Time Budgets (P95)

| Endpoint | Budget |
|----------|--------|
| `GET /cards/:cardNumber` | 100ms |
| `GET /cards` (search) | 300ms |
| `GET /cards/:cardNumber/deck-stats` | 500ms |
| `GET /tournaments/:id/decks` | 1000ms |
| `GET /cards/changes?since=...` | 2000ms (bulk allowed) |

### 8.3 Rate Limiting

The marketplace should respect platform rate limits via `Retry-After` headers and exponential backoff. Recommend: 600 RPM per API key, with burst allowance of 60 RPS for 10 seconds.

---

## 9. Multi-Game Considerations

The marketplace is designed to host multiple games (WoTF, BJBA, future). Open question: does `wonders-ccg-platform` serve only WoTF, or does it become a generic CCG platform service?

**Two viable architectures:**

### 9.1 Per-Game Platform Services (Recommended)

- `wonders-ccg-platform` exposes WoTF only.
- BJBA gets its own `bjba-platform` service.
- The marketplace's `src/lib/platform/` becomes `src/lib/games/<slug>/` with one client per game.
- Game-specific data shapes can diverge naturally.

### 9.2 Generic CCG Platform

- `ccg-platform` serves all games behind a `?game=wotf` query parameter.
- Single client in marketplace.
- Schema must accommodate both games' specifics — risk of awkward generalization.

**Decision needed before BJBA platform integration begins** (Phase 4 at the earliest). For now, treat `wonders-ccg-platform` as WoTF-specific and keep `src/lib/platform/` as a per-game module.

---

## 10. Open Questions for the Platform Team

| # | Question | Blocking |
|---|----------|----------|
| 1 | Is `wonders-ccg-platform` independent of Carde.io's compete.wondersccg.com or built on top of it? | All integration design |
| 2 | Will the platform host its own deck data, or proxy Carde.io's? | §2.1, §2.4 endpoints |
| 3 | What's the platform team's stance on emitting webhooks (vs. pull-only)? | Phase 4 meta-shift alerts |
| 4 | Will deck data be exposed publicly or partner-only? | Pricing strategy (the deck signal IS the moat) |
| 5 | Is there an OAuth2 IdP, or will linked identities use API keys initially? | §5 user-identity work |
| 6 | What's the relationship between `dbs_score` and any platform-side PRI? Does platform want to own PRI computation? | §2.2 |
| 7 | Tournament data — submitted by TOs, scraped from Carde.io, or both? Affects freshness SLAs. | §2.4 |
| 8 | Will the platform support multiple games eventually, or stay WoTF-specific? | §9 architecture decision |
| 9 | What is the platform's preferred API style (REST as written, or GraphQL/tRPC)? | Client design |
| 10 | Image hosting — does the platform serve card images, or only metadata pointing elsewhere? | UI/CDN architecture |

---

## 11. Summary Checklist

For the platform team, the **must-haves** to unblock StoneTrade's Phase 2 launch:

- [ ] API key auth (`X-Platform-Api-Key`)
- [ ] `GET /cards/:cardNumber/deck-stats` (or equivalent)
- [ ] `GET /cards/changes?since=...` for efficient sync
- [ ] `GET /api/v1/health` and `/schema`
- [ ] Versioning + deprecation header policy

**Should-haves** for Phase 3:
- [ ] Webhooks (`card.updated`, `card.retired`)
- [ ] Synergy strength scores
- [ ] OAuth identity linking

**Nice-to-haves** for Phase 4:
- [ ] `meta_shift.detected` webhook
- [ ] Role classification endpoint
- [ ] Bundle recommendation endpoint
- [ ] Tournament results feed + webhook

**Defer to Phase 5:**
- [ ] Multi-game generalization decisions
- [ ] Public read-only deck-data API for partners
- [ ] Reverse webhooks (marketplace → platform) for sales-data feedback into the deck builder
