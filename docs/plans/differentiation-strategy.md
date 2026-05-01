# Differentiation Strategy — TCG Shopping Experience

**Status:** v1 · 2026-05
**Sister docs:** `mystery-packs.md`, `deck-bundles.md`, `peer-consensus-listings.md`

---

## Thesis

The marketplace itself — listing UX, search, checkout, seller payouts — is a **commodity**. Every TCG marketplace has these. They are table stakes; they are not a moat.

StoneTrade's defensible difference is **price discovery for games with insufficient sales history, achieved by treating the deck-building / strategy engine as a first-class pricing signal source.** Everything we build should reinforce that wedge or get out of its way.

The five-part shopping-experience plan, ranked by leverage on the wedge:

| # | Feature | Status | Reinforces wedge by… |
|---|---|---|---|
| 1 | Attribution panel ("Why is this card moving?") | **SHIPPED** | Converting our schema work into a story buyers can feel |
| 2 | Meta-shift alerts (UI) | **SHIPPED** | Closing the retention loop on the engine-signal moat |
| 3 | Mystery packs with guaranteed minimums | PLAN | Format-level wedge — only possible because composite values exist |
| 4 | "Build this deck for $X" bundles | OUTLINE | Multi-card pricing — only possible with platform sync |
| 5 | Peer-consensus listings | OUTLINE | Trust signal for thin-market cards — answers "no sales history" |

What this plan **excludes** and why:

- **Card-for-card trades.** Schema exists, no UI. High build cost, classic engagement trap, doesn't reinforce the price-discovery moat. Defer.
- **Dutch auctions.** Interesting but solves a problem we don't have at current liquidity. Defer.
- **Founding Market Maker program.** Same — relevant once GMV is high.
- **Generic "advanced filters" / Meilisearch.** Table stakes, not differentiation. Background work.

---

## What's shipped in this PR

### 1. Attribution panel — "Why is this card moving?"

**Code:**
- `src/lib/attribution/explain.ts` — pure deterministic ranker
- `src/lib/attribution/load.ts` — Prisma data loader that calls the ranker
- `src/components/marketplace/AttributionPanel.tsx` — quiet UI rendering
- `tests/attribution/explain.test.ts` — 7 tests covering quiet state, engine shifts, tournament correlation, supply shocks, volume surges, drift

**Where it shows up:** card detail page, directly under the Market Read panel, divided by a hairline. One-line headline + signal chips.

**Honest contract:** we never claim causation we can't derive from numbers. When the strongest signal is a tournament that finished within 14 days of a same-direction PRI move, we phrase it as *"Following Dragon Cup #4 5d ago — engine read shifted +17 PRI."* Note: "Following," not "Because of." Temporal correlation, plain English.

**Signals the engine ranks (in order of narrative strength):**
1. Engine shift (PRI delta ≥5)
2. Tournament echo (a recent event + same-direction PRI move)
3. Supply shock (scarcity tier hit `scarce` / `acute`)
4. Volume surge (sales doubled or halved vs prior 7d)
5. Bid pressure (wants ≫ available)
6. Drift fallback (price moved but no clear cause)

When nothing crosses the noise floor: `"Quiet week. No notable signal in the last 7 days."`

### 2. Meta-shift alerts — UI

**Code:**
- `src/components/marketplace/WatchToggle.tsx` — per-card subscription affordance (4 toggle list)
- `src/app/(dashboard)/alerts/page.tsx` — full alert management surface
- Existing `/api/alerts` and `evaluateAlerts` worker were already complete; this PR builds the UI on top.

**Per-card watch toggle** (right rail of card detail): four switches — Price spike, Price drop, Back in stock, Meta shift. Click to subscribe; click again to remove. Optimistic UI with router refresh.

**Dashboard `/alerts` page:** lists all alerts with active/inactive toggle, last-fired timestamp, threshold display, and remove button. Empty state explains how to add alerts (point users to the card detail page).

**Cooldown:** 24h between fires per alert (already in the evaluator).

---

## Design language adjustments shipped alongside

The user feedback was that the project "looks very react/vibe-code standard." That was true of the dashboard layout, less true of the card detail page. This PR brings the dashboard up to the design doctrine standard:

- **Dashboard sidebar** rebuilt from generic-shadcn-list to grouped sections (Trading / Watching / Dragon Cup / Account) with mono uppercase group headers, ink-hierarchy text colors, and a 1px gold rail on the active item — matching the warm-backroom palette already established for the card detail page.
- **Alerts page** uses the same typographic hierarchy as the card detail: Fraunces display title with `opsz` 96, mono caps eyebrow, monospace tabular stats, hairline-bordered list rows. The page reads as a **register**, not a generic admin table.
- **AttributionPanel** uses a left-rail tone color (1px) instead of a colored card — quieter, more legible, defers to the (already loud) Market Read panel above it.

Keep this principle for future work: **chrome should never compete with content.** Boxes-in-boxes is the React/vibe-code tell. Hairline rails, precise typography, monospace numbers — those are the doctrine.

---

## What's planned but not built

See `mystery-packs.md`, `deck-bundles.md`, `peer-consensus-listings.md` for full plans.

**Order of operations** when picking up:
1. **Mystery Packs Phase 1** (1.5 wks) — schema + math + tests, no UI. The math is what the rest of the system has to trust.
2. **Mystery Packs Phase 2-3** (3 wks) — builder UI + buyer surface. This is the format-level wedge; it should ship before bundles.
3. **Deck Bundles Phase 1-2** (multi-week) — paste-decklist + multi-seller cart. Bundles are SEO leverage but only convert if the cart works.
4. **Peer-consensus listings** — wait until ≥500 active users, then ship Phase 1.

**Why this order:** mystery packs reuse existing schema and existing checkout flow with minimal new infrastructure. Bundles need a multi-seller cart, which is genuinely new platform plumbing. Consensus needs a critical mass of valuators.
