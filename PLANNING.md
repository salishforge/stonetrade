# StoneTrade — Price Discovery Extensions & Roadmap Planning

> Companion to `CCG-MARKETPLACE-SPEC.md`. The spec defines the canonical product surface and data model. This document captures **additive extensions** identified in product brainstorming that are not yet reflected in the spec, schema, or code — and proposes concrete additions, schema deltas, and phased delivery.

---

## 0. How To Use This Document

- The existing `CCG-MARKETPLACE-SPEC.md` remains the source of truth for everything currently scoped.
- Every section below either (a) **deepens** an existing spec area with concrete additions, or (b) **introduces** a feature not currently in the spec.
- Each item is tagged: `[NEW]` (not yet in spec), `[EXTENDS]` (deepens an existing spec section), or `[CONCRETIZES]` (turns an existing spec note into a buildable design).
- Schema additions are written as Prisma model fragments compatible with the current `prisma/schema.prisma`.
- TypeScript interfaces target the existing module layout under `src/lib/`.
- Cross-service requirements are deferred to `WONDERS-PLATFORM-REQUIREMENTS.md`.

---

## 1. Strategic Thesis

StoneTrade's defensible moat is not the marketplace itself — TCGPlayer-style listing UX is a commodity. The moat is **price discovery for games with insufficient sales history**, achieved by treating the deck-building / strategy engine as a first-class pricing signal source.

The flywheel:

```
Gameplay engine (decks, win rates, inclusion %)
     ↓
Demand signals (PRI, deck inclusion, role classification)
     ↓
Price discovery (composite value with engine-weighted inputs)
     ↓
Buyer/seller confidence (transparency, volatility, scarcity surfaces)
     ↓
Transactions (which feed back into the price model)
     ↓
More deck data (winning decks built from listings, cost calculator usage)
     ↓
[loop]
```

The practical implication: **the marketplace cannot wait for transaction volume** before establishing credible prices. The engine must produce a *plausible* price for any new card on day one, which sales then refine.

---

## 2. Current State Snapshot (As of this Document)

| Area | Status | Reference |
|------|--------|-----------|
| Card / Set / Game models | Implemented | `prisma/schema.prisma` |
| Composite price algorithm | Implemented (weighted percentile, time decay, outlier rejection) | `src/lib/pricing/composite-value.ts` |
| Confidence scoring | Implemented (volume + recency + diversity + agreement) | `src/lib/pricing/confidence-score.ts` |
| Source weights | Defined | `src/lib/pricing/constants.ts`, `src/types/pricing.ts` |
| Polls, Buylists, Sale Reports | Schema present | `prisma/schema.prisma` |
| Listings, Mystery Packs, Offers, Orders | Schema present | `prisma/schema.prisma` |
| Platform sync (cards) | Implemented | `src/lib/platform/{client,mapper,sync}.ts` |
| API routes | Scaffolded for cards, listings, polls, prices, offers, orders, collections, buylists, stripe, admin | `src/app/api/` |
| eBay integration | Scaffolding folder only | `src/lib/ebay/` |
| Carde.io integration | Scaffolding folder only | `src/lib/cardeio/` |
| AI features | Scaffolding folder only | `src/lib/ai/` |

---

## 3. Gap Inventory (Brainstorm vs Spec)

The following items came out of product brainstorms and are **not yet covered** by the spec or code:

| # | Feature | Spec Coverage | Status |
|---|---------|---------------|--------|
| 1 | Power Rating Index (PRI) | Not present (DBS exists upstream but is not a marketplace-level signal) | `[NEW]` |
| 2 | Deck Inclusion Rate as price signal | Mentioned in §8.1 prose, no model or pipeline | `[CONCRETIZES]` |
| 3 | Role classification (Staple/Tech/WinCon/Combo/Filler) | Not present | `[NEW]` |
| 4 | Volatility Index | `trend7d`/`trend30d` exist; no variance metric | `[EXTENDS]` |
| 5 | Scarcity Index (want/supply ratio) | Buylist exists; no derived index | `[EXTENDS]` |
| 6 | Card-for-card trades + ratio graph | Listed as Phase 5, no design | `[CONCRETIZES]` |
| 7 | Dutch auction listings | Not present | `[NEW]` |
| 8 | Founding Market Maker program | Not present | `[NEW]` |
| 9 | Meta-shift alerts | Not present | `[NEW]` |
| 10 | Engine-driven synergy bundles | Bundle listings exist; no engine-driven recommendation | `[EXTENDS]` |
| 11 | AI-assisted listing tool (price band suggestion) | §11.1 mentions price estimation; no UI/UX flow | `[CONCRETIZES]` |
| 12 | Listing-level confidence/freshness UX | Confidence is computed; no surface contract | `[CONCRETIZES]` |
| 13 | Peer-valuation consensus mode for new cards | Polls exist; no "3-of-N must agree before listing publishes" mode | `[NEW]` |
| 14 | Collection inventory totals as supply estimator | Collection model exists; no aggregation pipeline | `[EXTENDS]` |

---

## 4. Engine-Driven Price Signals

### 4.1 Power Rating Index (PRI) `[NEW]`

A composite, marketplace-side rating that aggregates engine signals into a single 0–100 score per card variant.

**Inputs (all sourced from `wonders-ccg-platform`):**
- `dbs_score` — already on `PlatformCardData`
- Deck inclusion rate (top-N decks, configurable window)
- Win rate when included (vs. baseline)
- Average copies played per deck
- Replacement rate when removed (proxy for irreplaceability)

**PRI is not a price.** It is an engine-weighted demand signal that the price model consumes alongside transactions, polls, and listings.

**Schema addition:**

```prisma
model CardEngineMetrics {
  id            String   @id @default(cuid())
  cardId        String   @unique
  card          Card     @relation(fields: [cardId], references: [id])

  // Raw inputs (cached from platform)
  dbsScore           Int?
  deckInclusionPct   Decimal? @db.Decimal(5, 2)  // 0.00–100.00
  winRateWhenIncluded Decimal? @db.Decimal(5, 2)
  avgCopiesPlayed    Decimal? @db.Decimal(4, 2)
  replacementRate    Decimal? @db.Decimal(5, 2)  // % of decks replacing card without performance loss

  // Computed
  pri                Int?     // 0–100 composite
  priConfidence      Int?     // 0–100, mirrors price-model confidence math

  // Provenance
  format             String?  // "Standard", "Limited", etc.
  windowStart        DateTime?
  windowEnd          DateTime?

  lastSyncedAt       DateTime @default(now())

  @@index([pri])
  @@index([deckInclusionPct])
}
```

**Treatment-vs-base note:** PRI is computed against the **base card identity** (cardNumber + name), not per-treatment. Treatments inherit the base PRI; price multipliers between treatments are observed empirically from sales.

**Module:** `src/lib/engine/pri.ts`

```ts
export interface PRIInputs {
  dbsScore: number | null;
  deckInclusionPct: number | null;
  winRateWhenIncluded: number | null;
  avgCopiesPlayed: number | null;
  replacementRate: number | null;
}

export function computePRI(inputs: PRIInputs): { pri: number; confidence: number };
```

**Default weights (tunable, store in `src/lib/pricing/constants.ts`):**
```ts
export const PRI_WEIGHTS = {
  DECK_INCLUSION:   0.35,
  WIN_RATE:         0.25,
  DBS_SCORE:        0.20,
  AVG_COPIES:       0.10,
  REPLACEMENT_RATE: 0.10,  // inverse — higher replacement = lower PRI contribution
} as const;
```

### 4.2 Engine-Weighted Composite Price `[EXTENDS]`

The current composite price uses purely transactional signals. PRI should bias the **prior** on cards with thin transaction data.

Proposed change to `composite-value.ts`:

```ts
// New signature — backward compatible with default behavior
computeCompositeValue(
  dataPoints: DataPoint[],
  options?: {
    pri?: number;
    priConfidence?: number;
    rarityComp?: { medianBySimilarRarity: number; sampleSize: number };
  }
): CompositeResult
```

**Behavior:**
- If `dataPoints.length >= MIN_DATA_POINTS`, behave as today.
- If below threshold, fall back to **engine-prior estimate**:
  - Look up median price of cards with similar PRI band + rarity + treatment.
  - Confidence is scaled by sample size of comparable cards.
  - Tag the resulting `marketMid` with `source: AI_ESTIMATE` for transparency in the UI.

This turns the composite from a "give up at low data" function into a "degrade gracefully toward the engine prior" function.

### 4.3 Role Classification `[NEW]`

Explicit categorization of each card's role in winning decks, sourced from the platform.

**Schema addition:**

```prisma
enum CardRole {
  STAPLE          // Appears in >40% of competitive decks
  TECH            // Situational sideboard / matchup-specific
  WIN_CONDITION   // Primary kill / objective card
  COMBO_PIECE     // Required for an enabler interaction
  FILLER          // Common, low-impact
  UNCLASSIFIED    // Insufficient data
}

model CardRoleAssignment {
  id          String   @id @default(cuid())
  cardId      String
  card        Card     @relation(fields: [cardId], references: [id])
  role        CardRole
  confidence  Int       // 0–100
  format      String?
  evaluatedAt DateTime  @default(now())

  @@index([cardId, role])
  @@index([role, confidence])
}
```

A card may have multiple role assignments (e.g., both `WIN_CONDITION` and `COMBO_PIECE`). Surface them as multi-select badges on the card detail page.

**Pricing implication:** `WIN_CONDITION` and `STAPLE` cards get a **floor multiplier** in the engine-prior estimate (configurable).

---

## 5. Volatility & Confidence Surfaces

### 5.1 Volatility Index `[EXTENDS]`

`CardMarketValue` already has `trend7d` and `trend30d` (signed % change). Add absolute volatility metrics so the UI can warn buyers about unstable prices.

**Schema addition (extend `CardMarketValue`):**

```prisma
// Append to existing model
stdDev30d       Decimal? @db.Decimal(10, 2)
coeffVar30d     Decimal? @db.Decimal(5, 4)  // stddev / mean — dimensionless
volatilityTier  String?                     // "stable" | "moderate" | "volatile" | "extreme"
```

**Tier thresholds (store in `src/lib/pricing/constants.ts`):**
```ts
export const VOLATILITY_TIERS = {
  STABLE:   { coeffVarMax: 0.10 },
  MODERATE: { coeffVarMax: 0.25 },
  VOLATILE: { coeffVarMax: 0.50 },
  EXTREME:  { coeffVarMax: Infinity },
} as const;
```

**UI contract (Phase 2 deliverable):**
- `<VolatilityBadge tier="volatile" />` component
- Card detail page shows badge next to price
- Search results allow `volatility != EXTREME` filter for risk-averse buyers

### 5.2 Confidence Surface Contract `[CONCRETIZES]`

Confidence is computed but not yet rendered consistently. Define the contract:

| Confidence Score | Tier | UI Treatment |
|-----|------|--------------|
| 0–14 | `insufficient` | No price shown; show `<EngineEstimateBanner />` with PRI-derived range and disclaimer |
| 15–39 | `low` | Price shown with yellow `<ConfidenceBadge />`; tooltip lists data-point sources |
| 40–69 | `moderate` | Price shown with neutral badge |
| 70–100 | `high` | Price shown with green badge; signal breakdown collapsed by default |

Already partially specified by `CONFIDENCE_THRESHOLDS` in `src/types/pricing.ts` — refine those constants and add the `<ConfidenceBadge />` component.

### 5.3 Listing-Time Price Coaching `[CONCRETIZES]`

When a seller creates a listing, call into the pricing engine and surface a **suggested band** before submission.

**Module:** `src/lib/pricing/listing-coach.ts`

```ts
export interface ListingCoachInput {
  cardId: string;
  treatment: string;
  condition: CardCondition;
}

export interface ListingCoachOutput {
  suggestedLow: number | null;
  suggestedMid: number | null;
  suggestedHigh: number | null;
  rationale: string;          // "Based on 12 sales over 30 days, $4.50–$7.25 is competitive."
  warnings: string[];          // ["Cards above suggestedHigh sell <30% of the time."]
  pricePosition: "below" | "competitive" | "premium" | "above_market";
}
```

Non-blocking — the seller can list at any price, but the coach surfaces what the market is doing.

---

## 6. Demand-Side Mechanics

### 6.1 Scarcity Index `[EXTENDS]`

Formalize the `BuylistEntry` aggregation as a derived index per card variant.

**Schema addition (extend `CardMarketValue`):**

```prisma
// Append to existing model
totalWanted        Int      @default(0)  // Sum of buylist quantities
totalAvailable     Int      @default(0)  // Sum of active listing quantities
totalCollected     Int      @default(0)  // Sum across CollectionCard
scarcityRatio      Decimal? @db.Decimal(8, 4)  // wanted / max(available, 1)
scarcityTier       String?  // "abundant" | "available" | "scarce" | "acute"
```

**Recompute trigger:** every buylist insert/update, listing transition (active↔sold), and on a 1h cron for safety.

**Pricing implication:** scarcity ratio above a threshold (e.g., 3.0) raises the engine-prior estimate's upper band.

### 6.2 Dutch Auction Listings `[NEW]`

For cards with no transaction history, allow sellers to opt into Dutch auctions: starting price decays linearly until a buyer accepts.

**Schema addition:**

```prisma
enum AuctionType {
  DUTCH       // price decays over time
  ENGLISH     // ascending bids (Phase 5)
}

model AuctionConfig {
  id            String      @id @default(cuid())
  listingId     String      @unique
  listing       Listing     @relation(fields: [listingId], references: [id])

  type          AuctionType
  startPrice    Decimal     @db.Decimal(10, 2)
  floorPrice    Decimal     @db.Decimal(10, 2)
  decayPerDay   Decimal     @db.Decimal(10, 2)  // for Dutch
  startedAt     DateTime    @default(now())
  endsAt        DateTime?
}
```

**`Listing.type`** enum should be extended:
```prisma
enum ListingType {
  SINGLE
  BUNDLE
  MYSTERY_PACK
  SEALED_PRODUCT
  AUCTION       // NEW
}
```

**Price discovery benefit:** the **first** buyer's accepted price becomes a high-confidence price signal, anchoring future listings.

### 6.3 Founding Market Maker Program `[NEW]`

For truly new cards (zero transactions, zero listings), recruit trusted community members to act as market makers for a limited window.

**Mechanic:**
- Verified users opt in to maker status for specific cards.
- They commit to maintaining a buy-listing pair for 30 days.
- In exchange: reduced platform fee on those listings, a `<MarketMakerBadge />` on their seller profile.

**Schema addition:**

```prisma
model MarketMakerCommitment {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  cardId      String
  card        Card     @relation(fields: [cardId], references: [id])
  treatment   String
  startsAt    DateTime
  endsAt      DateTime
  buyPrice    Decimal  @db.Decimal(10, 2)  // standing buy
  sellPrice   Decimal  @db.Decimal(10, 2)  // standing sell
  feeWaiverPct Decimal @db.Decimal(5, 2)   // e.g., 50.00 = 50% fee discount
  status      String   // "active" | "completed" | "breached"

  @@unique([userId, cardId, treatment, startsAt])
}
```

Applicable in **Phase 4** at earliest — requires reputation infrastructure.

### 6.4 Peer-Valuation Consensus Mode `[NEW]`

For a brand-new card (no PRI, no comps, no engine prior), require **3 independent listings within 25% of each other** before any single listing is publicly searchable.

This prevents a single seller from anchoring an unsupported price for a card that has no other reference.

**Schema addition:**

```prisma
// On Listing
requiresConsensus Boolean @default(false)  // set when no comps exist
consensusGroupId  String?                  // shared by listings being bundled for consensus
```

A background job promotes listings to public visibility once 3 listings of the same card+treatment are within ±25% of one another.

---

## 7. Card-for-Card Trade Network

Currently absent from schema. The spec lists it as Phase 5, but the **ratio-transaction graph** it enables is one of the most powerful price-discovery tools for early markets.

### 7.1 Trade Models `[NEW]`

```prisma
enum TradeStatus {
  PROPOSED
  COUNTERED
  ACCEPTED
  IN_TRANSIT
  COMPLETED
  CANCELLED
  DISPUTED
}

model Trade {
  id              String      @id @default(cuid())
  proposerId      String
  proposer        User        @relation("TradesProposed", fields: [proposerId], references: [id])
  recipientId     String
  recipient       User        @relation("TradesReceived", fields: [recipientId], references: [id])

  status          TradeStatus @default(PROPOSED)

  // Cash leg (optional — supports asymmetric trades)
  cashAdjustment  Decimal     @db.Decimal(10, 2) @default(0)

  // Engine fairness check at proposal time
  fairnessScore   Int?        // 0–100, 100 = perfectly balanced by market value
  fairnessNotes   String?

  message         String?

  proposedAt      DateTime    @default(now())
  respondedAt     DateTime?
  completedAt     DateTime?

  proposerItems   TradeItem[] @relation("ProposerSide")
  recipientItems  TradeItem[] @relation("RecipientSide")

  @@index([proposerId, status])
  @@index([recipientId, status])
}

model TradeItem {
  id                String     @id @default(cuid())
  tradeId           String
  trade             Trade      @relation("ProposerSide", fields: [tradeId], references: [id], map: "trade_proposer_fk")
  recipientTradeId  String?
  recipientTrade    Trade?     @relation("RecipientSide", fields: [recipientTradeId], references: [id], map: "trade_recipient_fk")

  cardId            String
  card              Card       @relation(fields: [cardId], references: [id])
  quantity          Int        @default(1)
  treatment         String
  condition         CardCondition @default(NEAR_MINT)
  serialNumber      String?

  // Snapshot of market value at proposal time (for fairness reproducibility)
  marketValueAtProposal Decimal? @db.Decimal(10, 2)
}
```

*Note: the dual `proposer/recipient` foreign-key idiom on `TradeItem` may simplify to a `side` enum (`PROPOSER`/`RECIPIENT`) on a single relation. Defer to implementation review.*

### 7.2 Engine Fairness Check

**Module:** `src/lib/trades/fairness.ts`

```ts
export function evaluateTradeFairness(trade: TradeWithItems): {
  fairnessScore: number;        // 0–100
  proposerSideValue: number;
  recipientSideValue: number;
  cashAdjustment: number;
  warnings: string[];           // e.g., ["Recipient is undervaluing by ~38%"]
  recommendedAdjustment: number; // suggested cash to balance
};
```

Non-blocking. The trade can proceed at any fairness score. The score is shown to both parties before they accept.

### 7.3 Ratio Transaction Graph `[NEW]`

Every completed trade generates **edges** in a directed value graph:

```
edge(CardA, CardB, ratio=2.0)   // 2x A traded for 1x B
```

For cards with no cash transactions, the graph yields **implied dollar values** via traversal. If `Card B` has a confident cash price and trades exist between `B` and `A`, then `A` gets an implied value with reduced confidence.

**Schema addition:**

```prisma
model TradeRatio {
  id              String   @id @default(cuid())
  fromCardId      String
  fromCard        Card     @relation("FromRatio", fields: [fromCardId], references: [id])
  toCardId        String
  toCard          Card     @relation("ToRatio", fields: [toCardId], references: [id])
  ratio           Decimal  @db.Decimal(10, 4)  // qty(to) / qty(from)
  cashAdjustment  Decimal  @db.Decimal(10, 2)  @default(0)
  tradeId         String
  recordedAt      DateTime @default(now())

  @@index([fromCardId])
  @@index([toCardId])
}
```

**Module:** `src/lib/pricing/ratio-graph.ts` — implements graph traversal, cycle detection, and confidence decay per hop.

### 7.4 Trade Escrow

Use Stripe Connect's authorization-and-capture flow for the cash leg, with platform-mediated card shipping confirmations gating the release. Reuse the existing `Order` infrastructure where possible — a trade is effectively two orders (one in each direction) with a shared fairness record.

---

## 8. Meta Intelligence Layer

### 8.1 Meta-Shift Alerts `[NEW]`

When the platform reports a card's deck inclusion rate, win rate, or role classification crossing a threshold, the marketplace alerts holders.

**Schema addition:**

```prisma
enum AlertType {
  META_SHIFT_INCLUSION_UP
  META_SHIFT_INCLUSION_DOWN
  PRICE_SPIKE
  PRICE_DROP
  BUYLIST_MATCH
  WANT_LIST_LISTED
  TRADE_PROPOSAL_RECEIVED
  AUCTION_ENDING_SOON
}

model UserAlert {
  id          String    @id @default(cuid())
  userId      String
  user        User      @relation(fields: [userId], references: [id])
  type        AlertType
  cardId      String?
  card        Card?     @relation(fields: [cardId], references: [id])
  payload     Json      // alert-specific data
  readAt      DateTime?
  createdAt   DateTime  @default(now())

  @@index([userId, readAt])
}

model UserAlertSubscription {
  id        String    @id @default(cuid())
  userId    String
  user      User      @relation(fields: [userId], references: [id])
  type      AlertType
  cardId    String?
  channel   String    // "in_app" | "email" | "discord"
  active    Boolean   @default(true)

  @@unique([userId, type, cardId, channel])
}
```

**Default subscriptions on user signup:** `BUYLIST_MATCH`, `WANT_LIST_LISTED`, `TRADE_PROPOSAL_RECEIVED`. Meta-shift alerts opt-in.

### 8.2 Meta Dashboard `[EXTENDS]`

The spec's §9.3 Discovery Dashboard mentions "Meta impact tracker" — concretize:

**Page:** `src/app/(discovery)/meta/page.tsx`

**Sections:**
- **Rising stars** — cards with deck-inclusion delta > +10% in 7d, sorted by inclusion-velocity
- **Falling out** — cards with delta < -10%, surfaces sell pressure for holders
- **Win-rate movers** — cards whose win-rate-when-included moved meaningfully
- **Format snapshot** — most-played cards in each format with current price + PRI
- **Tournament impact** — recent tournament winners' decklists with cost summaries

All data feeds from `wonders-ccg-platform` endpoints documented in `WONDERS-PLATFORM-REQUIREMENTS.md` §2.1, §2.4.

### 8.3 AI Market Reports `[CONCRETIZES]`

The spec's §11.3 mentions weekly AI reports. Concretize:

**Cron:** Sunday 23:00 UTC
**Module:** `src/lib/ai/market-report.ts`
**Inputs gathered:** top 10 movers (price), top 10 movers (inclusion), tournament results from prior week, new card releases, scarcity-tier transitions
**Output:** persisted as `MarketReport` record with markdown body; rendered at `/discovery/reports/[week]`

```prisma
model MarketReport {
  id          String   @id @default(cuid())
  weekStart   DateTime @unique
  weekEnd     DateTime
  bodyMd      String   @db.Text
  highlights  Json     // structured callouts for cards mentioned
  publishedAt DateTime @default(now())
}
```

Use the Anthropic SDK (already a dependency) with a structured prompt template stored in `src/lib/ai/prompts/market-report.ts`.

---

## 9. Engine-Driven Synergy Bundles `[EXTENDS]`

The `PlatformCardData.synergies` field already exists (flat array of card numbers). Two additions make it usable for marketplace recommendations:

1. **Strength-weighted synergy graph** — request that the platform expose synergies with a strength score (`{ cardNumber: "012", strength: 0.78 }`) — see `WONDERS-PLATFORM-REQUIREMENTS.md` §2.6.
2. **Bundle recommendation engine** — given a seed card, compute the top-K synergistic cards and surface as "Often built together" bundles.

**Module:** `src/lib/recommendations/synergy-bundles.ts`

```ts
export async function recommendBundle(
  seedCardId: string,
  options: { maxItems?: number; budgetUsd?: number; format?: string }
): Promise<BundleRecommendation>;

export interface BundleRecommendation {
  seedCard: CardSummary;
  items: Array<{ card: CardSummary; reason: string; suggestedQuantity: number }>;
  totalSuggestedPrice: number;
  availabilityNote: string;  // e.g., "7 of 8 cards have active listings"
}
```

**UI:**
- On the card detail page: "Often built together" carousel
- On the marketplace homepage: "Build this deck for $X" cards (using top-tournament decklists)

---

## 10. Schema-Add Summary

For implementation convenience, the consolidated additions:

**New models:**
- `CardEngineMetrics`
- `CardRoleAssignment`
- `MarketMakerCommitment`
- `Trade`, `TradeItem`, `TradeRatio`
- `AuctionConfig`
- `UserAlert`, `UserAlertSubscription`
- `MarketReport`

**New enums:**
- `CardRole`
- `TradeStatus`
- `AuctionType`
- `AlertType`

**Field additions to existing models:**
- `Card`: relations to new models
- `CardMarketValue`: `stdDev30d`, `coeffVar30d`, `volatilityTier`, `totalWanted`, `totalAvailable`, `totalCollected`, `scarcityRatio`, `scarcityTier`
- `Listing`: `requiresConsensus`, `consensusGroupId`; `ListingType` gains `AUCTION`
- `User`: relations for trades, market-maker commitments, alerts

---

## 11. Phased Rollout (Aligned With Existing Spec §13)

The spec's existing five phases stand. The extensions slot in as follows:

### Phase 2 (Price Discovery) — additions
- `CardEngineMetrics` model + sync from platform
- `computePRI()` implementation
- `<ConfidenceBadge />`, `<VolatilityBadge />` components
- Volatility fields on `CardMarketValue` + recompute pipeline
- Listing-time price coach (read-only suggestion at create time)
- Confidence/volatility surface contract on card detail page

### Phase 3 (Advanced Marketplace) — additions
- Scarcity index pipeline
- Auction listings (Dutch only)
- Peer-valuation consensus mode for new cards
- `UserAlert` infrastructure (in-app + email)
- Engine-prior fallback in composite price algorithm

### Phase 4 (Integration & Intelligence) — additions
- Role classification ingestion + UI
- Meta-shift alerts
- Meta dashboard
- AI weekly market reports
- Engine-driven synergy bundle recommendations
- Founding Market Maker program

### Phase 5 (Growth) — additions
- Card-for-card trade network (Trade, TradeItem, TradeRatio)
- Engine fairness check
- Trade escrow leveraging Stripe Connect
- Ratio-graph implied-value computation feeding engine prior
- English auctions

---

## 12. Cross-Cutting Concerns

### 12.1 Recompute Triggers

Most derived models (`CardMarketValue`, `CardEngineMetrics`, `TradeRatio` aggregations) are **eventually consistent**. Define triggers explicitly:

| Event | Recomputes |
|-------|------------|
| Listing created/sold/expired | `CardMarketValue` for affected card; `scarcityRatio` |
| BuylistEntry upsert | `scarcityRatio`, alert dispatch |
| ValuePollVote insert | `CardMarketValue` for poll's card |
| SaleReport verified | `CardMarketValue` for card |
| Trade completed | `TradeRatio` insert; `CardMarketValue` recompute via implied-value pass |
| Platform sync run | `CardEngineMetrics`, downstream `PRI` and engine-prior cache |
| 1h cron | Volatility, trends, scarcity tiers |
| 24h cron | Confidence cache refresh, role-assignment refresh |

Use a queue (Inngest, Trigger.dev, or simple `pg-boss`) to debounce — a card can have many sub-events; coalesce within a short window.

### 12.2 Observability

Add structured events for every price/PRI change so we can audit the engine post-hoc:

```ts
// src/lib/telemetry.ts
export function emit(event: "price.recompute" | "pri.recompute" | "scarcity.recompute" | ..., payload: object): void;
```

Target: Postgres `EngineEvent` table for the first iteration; route to PostHog or Tinybird later.

### 12.3 Testing Strategy For Pricing

The pricing module is the hardest to test because correct behavior is statistical, not exact. Create:

- **Fixture sets** under `prisma/seed/pricing-fixtures/` — synthetic data points modeling: thin-data, dense-data, post-tournament-spike, manipulated-via-shill-listings, recovering-after-rotation.
- **Property-based tests** asserting: more recent data dominates older; outlier rejection holds; confidence increases monotonically with volume; engine prior gracefully degrades to null with neither comps nor PRI.
- **Snapshot tests** for the 50 most-traded cards' computed values across releases — diff alerts on regressions.

### 12.4 Decimal Arithmetic

The `decimal.js` dependency is already in `package.json`. Enforce: **all monetary math goes through `Decimal`**, never raw `number`. Add an ESLint rule (or runtime guard) that flags `Decimal` ↔ `number` conversions outside designated boundary modules.

---

## 13. Open Questions

| # | Question | Owner | Blocker For |
|---|----------|-------|-------------|
| 1 | Does `wonders-ccg-platform` belong to Carde.io or Salishforge? Spec §8 references compete.wondersccg.com as Carde.io's. | Product | All platform integration work |
| 2 | Will BJBA share the same platform service or require its own? | Product | Multi-game roadmap |
| 3 | What is the legal exposure on mystery packs in WA / TX / CA? | Legal | Mystery pack launch (Phase 3) |
| 4 | Stripe Connect or Stripe Standard for sellers? Affects fee math. | Finance | Phase 1 launch |
| 5 | Confidence tier thresholds — calibrate against real data after Phase 1 launch | Engineering | Phase 2 ship |
| 6 | PRI weights — calibrate after first month of platform sync data | Engineering | Phase 2 ship |
| 7 | Should role classification be platform-side or marketplace-side? Marketplace knows more about prices and supply, platform knows more about decks. | Engineering | Phase 4 ship |
| 8 | Trade escrow — fully Stripe-mediated or use a third-party escrow service? | Engineering | Phase 5 ship |
| 9 | Card image rights — use platform-hosted or seller-uploaded only? | Legal | Phase 1 ship |
| 10 | When platform exposes deck data via API, is it public or partner-only? Affects pricing-engine moat | Product | Phase 2+ |

---

## 14. Document Maintenance

This document should be **decomposed into GitHub issues** before work begins. Each `[NEW]` and `[CONCRETIZES]` item maps to one issue, linked back here. As issues close, mark items in §3 as `Implemented` and link the resulting code module / migration.

Spec drift between this document and `CCG-MARKETPLACE-SPEC.md` should be resolved by promoting accepted items into the spec, not by leaving them dual-tracked.
