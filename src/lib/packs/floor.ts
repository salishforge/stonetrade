import Decimal from "decimal.js";
import type { PackTier, PackTiers } from "./tiers";

/**
 * Pack floor + expected-value math.
 *
 * The floor is what the seller is contractually committing to: every pack
 * sold contains at least `Σ (tier.slots × tier.floor)` of value. The
 * floor-enforcement worker (Phase 4) compares each tier's `floor` against
 * the pool's *actual* running minimum market value and pauses listings
 * whose pool dips below.
 *
 * EV is what the buyer can expect on average. It's the floor's complement:
 * computed from the *current* market values of pool entries, weighted by
 * `weights` (or uniform if absent). EV is a derived view, never persisted —
 * it moves as the market moves; the floor is fixed by seller commitment.
 *
 * Confidence is rolled up from the per-card `CardMarketValue.confidence`
 * scores in the pool, weighted the same way. A buyer looking at a pack
 * with EV=$45 / confidence=82 has a different read than EV=$45 /
 * confidence=18 — both should be visible, neither hidden behind a tooltip.
 *
 * This module is pure. Inputs come in, numbers go out. No Prisma access
 * here — the loader (`load.ts`, future) is responsible for assembling
 * `PoolMarketLookup` from current `CardMarketValue` rows.
 */

/**
 * Per-listing market data the math needs. Keyed by Listing.id.
 *
 * `marketMid`: current composite mid for the listing's card (NM treatment
 * snapshot). `null` when no value is computed yet — we treat such entries
 * as zero for floor purposes (they can't contribute to a guarantee) and
 * exclude them from EV (averaging in zero would mislead).
 *
 * `confidence`: 0..100 from `CardMarketValue.confidence`. Null → treated as
 * zero confidence (won't lift the rolled-up score).
 */
export type PoolEntryMarket = {
  marketMid: Decimal | string | number | null;
  confidence: number | null;
};
export type PoolMarketLookup = Map<string, PoolEntryMarket | undefined>;

export interface PackEconomicsInput {
  tiers: PackTiers;
  market: PoolMarketLookup;
}

export interface TierEconomics {
  name: string;
  slots: number;
  /** Sum of floor × slots — the contractual contribution of this tier. */
  floorTotal: Decimal;
  /** Lowest current marketMid among pool entries with a value. Null if none have one. */
  poolMin: Decimal | null;
  /** EV for this tier (slots × weighted-mean(marketMid of pool with values)). */
  evTotal: Decimal;
  /** Pool-weighted confidence average, 0..100. */
  confidence: number;
  /** True when the pool's lowest current value is below the seller's committed floor. */
  floorViolated: boolean;
  /** Number of pool entries whose marketMid is missing — buyer should know. */
  unpricedCount: number;
}

export interface PackEconomics {
  /** Per-tier rollups, in input order. */
  tiers: TierEconomics[];
  /** Σ tier.floorTotal — the seller's published guaranteed minimum. */
  guaranteedMinValue: Decimal;
  /** Σ tier.evTotal — the buyer's expected pull value at current market. */
  expectedValue: Decimal;
  /** Slot-weighted confidence across tiers, 0..100. */
  confidence: number;
  /** True when any tier's pool currently breaches its committed floor. */
  floorViolated: boolean;
  /** Total cards in a pack. Equals Σ slots; included for convenience. */
  cardCount: number;
}

function toDecimal(v: Decimal | string | number | null | undefined): Decimal | null {
  if (v == null) return null;
  if (v instanceof Decimal) return v;
  // decimal.js accepts string + number; guard against NaN.
  const d = new Decimal(v);
  return d.isFinite() ? d : null;
}

/**
 * Pure: given tier definitions + a snapshot of current market values per
 * listing, compute the rolled-up economics. Doesn't mutate inputs.
 *
 * Behavior on edge cases (worth pinning explicitly):
 *  - Pool entry missing from `market` map: treated as unpriced. Doesn't
 *    contribute to EV or confidence; doesn't pull poolMin down.
 *  - Pool entry present but marketMid=null: same as missing.
 *  - All entries unpriced in a tier: tier EV=0, confidence=0, poolMin=null,
 *    floorViolated stays false (we don't punish a seller for our own
 *    unpriced data — the floor is their commitment regardless).
 *  - weights present: used for both EV and confidence rollup. Entries with
 *    null marketMid are excluded from the weight sum so they don't shrink
 *    the weighted mean.
 *  - All weights zero (shouldn't happen — tiersSchema rejects it): we'd
 *    divide by zero. Caller is expected to have validated tiers first.
 */
export function computePackEconomics(input: PackEconomicsInput): PackEconomics {
  const tierResults = input.tiers.map((tier) => computeTier(tier, input.market));

  let guaranteedMin = new Decimal(0);
  let ev = new Decimal(0);
  let confidenceWeightedSum = 0;
  let confidenceWeightTotal = 0;
  let cardCount = 0;
  let floorViolated = false;

  for (const t of tierResults) {
    guaranteedMin = guaranteedMin.plus(t.floorTotal);
    ev = ev.plus(t.evTotal);
    confidenceWeightedSum += t.confidence * t.slots;
    confidenceWeightTotal += t.slots;
    cardCount += t.slots;
    if (t.floorViolated) floorViolated = true;
  }

  const confidence =
    confidenceWeightTotal === 0 ? 0 : confidenceWeightedSum / confidenceWeightTotal;

  return {
    tiers: tierResults,
    guaranteedMinValue: guaranteedMin,
    expectedValue: ev,
    confidence: Math.round(confidence),
    floorViolated,
    cardCount,
  };
}

function computeTier(tier: PackTier, market: PoolMarketLookup): TierEconomics {
  const floor = new Decimal(tier.floor);
  const floorTotal = floor.times(tier.slots);

  // Build parallel arrays of priced entries with their effective weight.
  const priced: { mid: Decimal; weight: number; confidence: number }[] = [];
  let unpricedCount = 0;
  let poolMin: Decimal | null = null;

  tier.pool.forEach((listingId, idx) => {
    const entry = market.get(listingId);
    const mid = toDecimal(entry?.marketMid ?? null);
    const w = tier.weights ? tier.weights[idx] : 1;
    if (mid == null || w <= 0) {
      // Entries with weight 0 are effectively excluded from draws — treat
      // them like unpriced entries for EV purposes too.
      if (mid == null) unpricedCount += 1;
      return;
    }
    priced.push({ mid, weight: w, confidence: entry?.confidence ?? 0 });
    if (poolMin == null || mid.lessThan(poolMin)) poolMin = mid;
  });

  let perSlotEv = new Decimal(0);
  let weightedConf = 0;
  if (priced.length > 0) {
    const totalWeight = priced.reduce((s, p) => s + p.weight, 0);
    if (totalWeight > 0) {
      let evSum = new Decimal(0);
      let confSum = 0;
      for (const p of priced) {
        evSum = evSum.plus(p.mid.times(p.weight));
        confSum += p.confidence * p.weight;
      }
      perSlotEv = evSum.dividedBy(totalWeight);
      weightedConf = confSum / totalWeight;
    }
  }

  const evTotal = perSlotEv.times(tier.slots);
  const floorViolated = poolMin != null && (poolMin as Decimal).lessThan(floor);

  return {
    name: tier.name,
    slots: tier.slots,
    floorTotal,
    poolMin,
    evTotal,
    confidence: Math.round(weightedConf),
    floorViolated,
    unpricedCount,
  };
}
