# Deck Bundles — "Build this deck for $X"

**Status:** OUTLINE · framework only
**Owner:** TBD
**Differentiator wedge:** §4 of `differentiation-strategy.md`

---

## 1. Thesis

Generic marketplaces price one card at a time. **StoneTrade can price a deck.**

We have two unique capabilities no competitor has:
1. Decklist data from the Wonders platform (`src/lib/platform/`)
2. A composite market value per card (`CardMarketValue`)

Combine them and the obvious feature falls out: given a deck archetype, compute the cheapest way to acquire all its cards across multiple sellers, route the buyer to a multi-seller cart that minimizes total cost (or minimizes shipping, or maximizes single-seller consolidation, depending on user preference).

This is **the only feature in the differentiation set that is also a top-of-funnel SEO play**: every "cheapest <archetype> deck" search becomes a StoneTrade landing page.

## 2. What's already there

- Wonders deck-list sync exists (`src/lib/platform/sync.ts`)
- `CardMarketValue` is computed for every card with sufficient data
- Listings + checkout work for single-seller orders
- `Listing.shipsFrom` field exists for shipping consolidation logic

What's **missing**:

- No `Deck` or `DeckCard` model in StoneTrade's schema (decks live on the platform, not here)
- No multi-seller cart (`Order` is per-listing today)
- No "build this deck" UI surface
- No bundle-pricing algorithm

## 3. Core algorithm sketch

```
Inputs:
  decklist: { cardId, treatment?, copies }[]
  preferences: {
    optimizeFor: "total_cost" | "min_shipping" | "single_seller_when_close",
    maxSellers: number,
    treatments: "any" | "match_exact",
    conditions: minCondition,
  }

Algorithm:
  For each line in decklist:
    candidates = active listings matching (cardId, treatment?, condition >= min, qty available)
  
  Solve as a min-cost flow / set-cover variant:
    - cost(seller) = Σ (price × copies) + sellerShippingCost
    - constraint: copies satisfied per line
    - constraint: ≤ maxSellers distinct sellers
  
  Output: { selectedListings, totalCost, sellerCount, shippingTotal, breakdownByLine }
```

For first cut: a greedy solver per line (cheapest listing first, fall back to next cheapest if a higher-priority line consumes inventory). Optimal solver (ILP / min-cost flow) lands later.

## 4. Surface area sketch

Four pages, ranked by SEO leverage and dev cost:

1. **`/deck/[archetype-slug]`** — the SEO landing. Public, indexable. Shows the archetype's standard list (from Wonders platform), live total cost across the marketplace, "Build this deck →" CTA. Server-rendered, cached 5 min.
2. **`/build`** — paste a decklist (text format) or pick from popular archetypes; instant pricing
3. **`/build/[id]/checkout`** — the multi-seller cart. Selected listings grouped by seller; each seller's group shows shipping; total at top
4. **`/dashboard/decks`** — saved deck price-tracking surface (price-changed alert subscriptions per deck)

## 5. Integration points

- `src/lib/platform/sync.ts` — extend to pull archetype decklists, not just per-card metrics
- New schema: `Deck`, `DeckLine`, `BundleOrder` (or extend `Order` with `parentBundleId`)
- New service: `src/lib/bundles/solver.ts` (greedy v1, ILP v2)
- Multi-seller cart UI — meaningful work; the existing single-listing checkout flow doesn't generalize cleanly
- Stripe Connect: each seller's leg of the bundle needs its own transfer; existing webhook splits per-listing already, so per-seller-group of the bundle is fine

## 6. Risk and unknowns

- **Inventory races.** Between solve time and checkout completion, a listing gets bought elsewhere. Reservation TTL (5-10 min hold) is mandatory.
- **Shipping math is hard.** Real consolidation requires knowing each seller's shipping policy as more than `shipsFrom`. May need a `ShippingPolicy` model per seller.
- **Tournament-legal vs casual.** A "build this deck" page should declare the format (Wonders Standard / Eternal / Casual) and validate legality — surface illegal substitutions clearly.
- **What's an "archetype"?** The platform side has to canonicalize decklists into a finite archetype set. Could lean on cluster analysis of registered decks instead of editorially curating.

## 7. Phasing

- **Phase 1** — Schema + greedy solver + `/build` paste-decklist UI (no SEO landing, no archetype concept yet). Internal-feeling but valuable to power users.
- **Phase 2** — Multi-seller cart + checkout. This is the hard engineering.
- **Phase 3** — Archetype concept + `/deck/[slug]` SEO surface. Editorial curation of canonical decklists; build sitemap.
- **Phase 4** — Saved decks + price alerts on a deck (reuses `UserAlert` machinery, new `DECK_PRICE_DROP` alert type).

## 8. Pickup notes

When resuming: do **not** start with the SEO surface even though it's the highest-leverage one — the multi-seller cart is the dependency. Without it, "$X for this deck" is a stat that can't convert. Build Phase 1 + 2 first; the SEO play only matters when conversion is real.

The greedy solver is fine for v1. The min-cost flow solver only matters once buyer feedback says "this is suggesting a 6-seller checkout when 3 sellers would have been almost as cheap."
