# Mystery Packs — Implementation Plan

**Status:** PLAN · not started
**Owner:** TBD
**Differentiator wedge:** §3 of `differentiation-strategy.md`

---

## 1. The Wedge

A mystery pack is a curated multi-card bundle where the buyer sees:

- a **guaranteed minimum value** (computed from `CardMarketValue`, not seller-asserted)
- the pool of possible contents (or distribution tiers, depending on `RevealPolicy`)
- a buyer-side **expected value** range with confidence

…and pays a single price. The seller composes the pack from real listings; on purchase, the system pulls actual cards out of the pool and ships them.

This is structurally novel vs. raw-singles marketplaces. The trust signal that makes it work — *we can prove the floor before you buy* — only exists because StoneTrade already has a defensible composite value engine. **Without `CardMarketValue`, mystery packs are a gamble. With it, they're a priced derivative.**

## 2. What's already there

Schema is drafted (`prisma/schema.prisma:608-638`):

- `MysteryPack { listingId, name, description, guaranteedMinValue, cardCount, tiers: Json, revealPolicy }`
- `MysteryPackOutcome { mysteryPackId, orderId, contents: Json, totalValue, buyerRating, buyerComment }`
- `enum RevealPolicy { BUYER_CHOICE | ALWAYS_REVEAL | SELLER_REVEALS }`
- `Listing.type` already supports `MYSTERY_PACK` (via `enum ListingType`)

What's **missing**:

- No API routes (`/api/mystery-packs/*`)
- No UI — `/seller/mystery-pack-builder` is a stub
- No `tiers` schema definition (it's `Json`)
- No outcome-generation logic
- No guaranteed-minimum-value enforcement
- No refund-on-shortfall flow

## 3. Tier Structure (schema definition for the `tiers` JSON)

```ts
type PackTier = {
  /** Display name, e.g. "Hit slot", "Rare slot", "Common slot". */
  name: string;
  /** How many cards are drawn from this tier into each pack. */
  slots: number;
  /** Pool the slot draws from — listing IDs the seller has reserved. */
  pool: string[];          // listing IDs
  /** Optional weighting override — by default each pool entry is equiprobable. */
  weights?: number[];
  /** Floor price for any card pulled from this tier. Used for minimum-value math. */
  floor: Decimal;
};

type PackTiers = PackTier[];
```

The seller commits a set of *real listings* into a pool per tier. When a pack sells, we draw `slots` cards (uniform or weighted) from each tier's pool. The pool listings stay reserved (`status = RESERVED_FOR_PACK`) for the lifetime of the pack listing.

## 4. Guaranteed Minimum Value — the math we publish

For each tier, the **floor** is the minimum `marketMid` across its current pool entries. The pack-level guaranteed minimum is `Σ (tier.slots × tier.floor)`.

If at any point a pool's contents drop below the published floor (e.g. a high-value listing in the pool sells through a different channel), the pack listing is **automatically suspended** until the seller refills the pool. This is the trust contract — we do not let the published floor lie.

`buyerEV` is `Σ (tier.slots × mean(marketMid of pool entries))` — published alongside the floor, with a confidence interval derived from the pool's `confidence` distribution.

## 5. Reveal Policy

- `BUYER_CHOICE` (default): buyer sees full pool list; outcome reveals on order completion.
- `ALWAYS_REVEAL`: outcome posts to a public "recent pulls" feed, anonymized seller-side. This is the social proof multiplier — if people see the floor holding across N pulls, packs sell.
- `SELLER_REVEALS`: buyer sees tier names + counts only; pool is hidden. Used for high-end "blind" packs.

## 6. Implementation phases

### Phase 1 — Foundation (1.5 weeks)
- `prisma/migrations/` — add `RESERVED_FOR_PACK` to `ListingStatus`
- `src/lib/packs/tiers.ts` — Zod validators for the `tiers` JSON shape
- `src/lib/packs/floor.ts` — pure function: given tiers + market values, compute `{ guaranteedMinValue, expectedValue, evConfidence }`
- Tests covering: empty pool, single-tier, multi-tier, missing market values, mixed-confidence pools

### Phase 2 — Builder UI (`/seller/mystery-pack-builder`) (2 weeks)
**Page layout (matches existing card detail aesthetic):**
- Left rail: pool builder. Search + filter your active listings, drag into tier slots. Tier slots show running floor and EV in tabular mono.
- Center: pack preview. Live render of buyer view as tiers fill — guaranteed-min ticker, EV range, reveal policy selector.
- Right rail: pricing assistant. Suggests pack price as a multiple of EV (default 0.85× to leave buyer surplus); flags if your price is below EV floor (= you're losing money in expectation).
- Tone: nothing flashy — same hairline borders, font-mono labels, surface-raised panels. **No purple confetti when a pack is published.** Settle-easing on the publish action, that's it.

### Phase 3 — Buyer surface (1 week)
- Browse: pack listings get a distinct treatment — wider card, surfaces guaranteed-min + EV chip in lieu of single price tag
- Pack detail page: same column structure as card detail page, but the price stack panel becomes a **pack stack panel** (cardCount, guaranteed-min, EV, confidence, recent-pulls feed if `ALWAYS_REVEAL`)
- Purchase flow reuses existing checkout; on payment success, run `drawOutcome()` server-side, mark pulled listings `SOLD`, write `MysteryPackOutcome`, create `Order` linking to outcome

### Phase 4 — Outcome integrity (1 week)
- `src/lib/packs/draw.ts` — RNG with auditable seed (store seed on outcome row, signed with a server secret; lets us replay-prove honesty)
- Floor enforcement worker: cron checks every active pack listing every 15 min; if pool floor falls below published minimum, set listing to `PAUSED_FLOOR_VIOLATION` and email seller
- Refund-on-shortfall: if for any reason the actual outcome value falls below the published guaranteed-min (e.g. a race condition in pool tracking), automatically partial-refund the difference. Surface this in the `MysteryPackOutcome` row.

### Phase 5 — Social proof (optional, 1 week)
- `/discovery/recent-pulls` — anonymous feed of `ALWAYS_REVEAL` outcomes
- Per-pack "pull history" panel showing the running mean outcome value vs guaranteed-min
- Seller reputation badge: "Mystery seller · 47 packs · floor never breached"

## 7. Risks & open questions

- **Abuse vector: stuffing low-end pools.** A seller could fill the high tier with 1× $50 card and 99× $2 cards — math says the floor is $2 per slot but EV looks great. Mitigation: surface **distribution histograms** prominently, not just EV; cap pool weight skew.
- **Fee structure.** We charge 8% on listings; on a pack the same flat 8% under-taxes the operational cost (RNG, dispute load). Likely 10-12% on packs.
- **Treatments inside packs.** A pool entry has a treatment (Foil, OCM). Do we let the seller mix treatments into one slot? Probably yes, but the floor math has to reflect the **per-treatment** market mid.
- **Refunds.** Once a pack is opened (outcome generated, cards shipped), no refund — the buyer got the cards. Floor-violation refunds happen *before* shipping, in the gap between order creation and pull.
- **Auction packs?** Not in v1. Schedule for after Dutch auctions land.

## 8. Success metrics

- ≥5% of GMV through mystery packs by month 3 of launch
- ≥4.0/5 average buyer rating on `MysteryPackOutcome.buyerRating`
- 0 confirmed floor-violation incidents (the floor is the trust contract)
- Seller adoption: ≥10% of sellers with >50 active listings publish at least one pack

---

## Hand-off note for picking up later

The cleanest first commit when resuming: **drop a Phase 1 PR**. Migration + `tiers.ts` validator + `floor.ts` + tests. Touches no UI, lands the math, and the math is what the rest of the system has to trust. Once that's in main, Phase 2 is mostly UI work over a stable foundation.
