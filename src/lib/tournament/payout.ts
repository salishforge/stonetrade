// Dragon Cup payout engine — translates a finishing order into per-Dragon
// payouts under the two-pool framework from the PDF.
//
// Two pools, separate eligibility:
//   * Base prize pool — pays only the Top 16 finishers regardless of
//     collection size. Per slide 10, fixed amounts per finishing band.
//   * Dragon Gold pool — pays only the Top 32 finishers (relative to
//     other Dragons), proportional to weighted points = declared points
//     × finish-band multiplier. Per slides 11–12.
//
// All numbers are integers in cents to keep the arithmetic exact and
// match the rest of the marketplace's money handling. Decimal could be
// used here too but the rounding semantics on the 9.6%-of-$200K example
// from the PDF resolve cleanly with integer cents.

export interface PayoutInputResult {
  registrationId: string;
  finishingPosition: number;
  declaredPoints: number;
}

export interface ComputedPayout {
  registrationId: string;
  finishingPosition: number;
  multiplier: number;
  weightedPoints: number;
  basePayoutCents: number;
  dragonGoldPayoutCents: number;
}

// PDF slide 10 — base prize pool ($50,000 total in the example, distributed
// to top 16). The amounts are fixed per finishing band.
const BASE_PAYOUT_CENTS_BY_POSITION: ReadonlyArray<{
  from: number;
  to: number;
  cents: number;
}> = [
  { from: 1,  to: 1,  cents: 2_000_000 }, // 1st: $20,000
  { from: 2,  to: 2,  cents:   800_000 }, // 2nd: $8,000
  { from: 3,  to: 4,  cents:   300_000 }, // 3rd-4th: $3,000 each
  { from: 5,  to: 8,  cents:   200_000 }, // 5th-8th: $2,000 each
  { from: 9,  to: 16, cents:   100_000 }, // 9th-16th: $1,000 each
];

// PDF slide 11 — finish-position multipliers for weighted-points calc.
const FINISH_MULTIPLIERS: ReadonlyArray<{
  from: number;
  to: number;
  mult: number;
}> = [
  { from: 1,  to: 1,  mult: 10 },
  { from: 2,  to: 2,  mult: 9 },
  { from: 3,  to: 4,  mult: 8 },
  { from: 5,  to: 8,  mult: 7 },
  { from: 9,  to: 16, mult: 6 },
  { from: 17, to: 32, mult: 5 },
];

function basePayoutCents(position: number): number {
  for (const band of BASE_PAYOUT_CENTS_BY_POSITION) {
    if (position >= band.from && position <= band.to) return band.cents;
  }
  return 0;
}

function finishMultiplier(position: number): number {
  for (const band of FINISH_MULTIPLIERS) {
    if (position >= band.from && position <= band.to) return band.mult;
  }
  return 0;
}

/**
 * Compute payouts for a tournament. Inputs is the full finishing order
 * (one row per registration that finished); positions must be unique.
 * dragonGoldPoolCents is the total Dragon Gold pool to distribute.
 *
 * Returns one ComputedPayout per input, with the math cached so the
 * persisted TournamentResult rows can record exactly what was paid.
 *
 * Tie-breaking: positions are caller-provided; this engine doesn't
 * synthesise ties. If the caller hands two registrations the same
 * position, both will receive the same band's base payout and weighted
 * multiplier — by design, since real-world Dragon Cup uses tie-break
 * rules out of scope here.
 */
export function computePayouts(
  inputs: ReadonlyArray<PayoutInputResult>,
  dragonGoldPoolCents: number,
): ComputedPayout[] {
  // Pass 1: compute weighted points for each top-32 finisher, accumulate the
  // total weighted across all top-32 entries.
  const computed: ComputedPayout[] = inputs.map((input) => {
    const mult = finishMultiplier(input.finishingPosition);
    const weighted = mult > 0 ? input.declaredPoints * mult : 0;
    return {
      registrationId: input.registrationId,
      finishingPosition: input.finishingPosition,
      multiplier: mult,
      weightedPoints: weighted,
      basePayoutCents: basePayoutCents(input.finishingPosition),
      dragonGoldPayoutCents: 0, // filled in pass 2
    };
  });

  const totalWeighted = computed.reduce((s, c) => s + c.weightedPoints, 0);

  // Pass 2: per-finisher Dragon Gold share. Use integer cent multiplication
  // ordered to avoid intermediate truncation. dragonGoldPoolCents and
  // totalWeighted are both integers; (weighted * pool) / total stays exact
  // as long as we keep it as BigInt before flooring.
  if (totalWeighted > 0) {
    const poolBig = BigInt(dragonGoldPoolCents);
    const totalBig = BigInt(totalWeighted);
    for (const row of computed) {
      if (row.weightedPoints <= 0) continue;
      const share = (BigInt(row.weightedPoints) * poolBig) / totalBig;
      row.dragonGoldPayoutCents = Number(share);
    }
  }

  return computed;
}

// =============================================================================
// Contract-driven distribution among pack members
// =============================================================================
//
// Once the engine produces payouts at the Dragon level, pack-owned Dragons
// must distribute their winnings among members per the ratified contract.
// Personal Dragons skip this step — the rider field on DragonRegistration
// names the recipient, but the prize goes to the binder owner per the PDF
// ("Dragon Gold Prizes will be paid directly to the person that submitted
// the Dragon Binder").

import type { ContractPayoutMode, RiderPaymentMode } from "@/generated/prisma/enums";

export interface ContractDistributionInput {
  payoutMode: ContractPayoutMode;
  riderPaymentMode: RiderPaymentMode;
  riderPaymentValueDollars: number; // Decimal-as-number for arithmetic
  manualAllocations: ReadonlyArray<{ userId: string; percent: number }> | null;
  scaleContributions: ReadonlyArray<{ userId: string; points: number }>;
  dragonRiderUserId: string | null;
}

export interface ContractDistributionRow {
  userId: string;
  // Sum across all reasons this user gets paid (member share + rider fee
  // when they hold both roles).
  amountCents: number;
  // Itemised breakdown for audit / UI.
  riderFeeCents: number;
  memberShareCents: number;
}

/**
 * Distribute a single Dragon's prize money (basePayout + dragonGoldPayout)
 * among pack members per the ratified contract. Two stages:
 *   1. Deduct the rider payment from the gross prize.
 *   2. Allocate the remainder either by manual percentages or
 *      proportionally to each member's scale-points contribution.
 *
 * The rider fee + member shares are returned itemised per user; if the
 * rider is also a pack member they get one row that sums both reasons.
 *
 * Rounding: cents math via integer arithmetic. Member shares are computed
 * as floor(remainder × percent_basis_points / 10_000). Any sub-cent
 * remainder accrues to the highest-share member to ensure exact totals.
 */
export function distributeContractPayout(
  totalPrizeCents: number,
  input: ContractDistributionInput,
): ContractDistributionRow[] {
  const rows = new Map<string, ContractDistributionRow>();
  const ensure = (userId: string): ContractDistributionRow => {
    let row = rows.get(userId);
    if (!row) {
      row = { userId, amountCents: 0, riderFeeCents: 0, memberShareCents: 0 };
      rows.set(userId, row);
    }
    return row;
  };

  if (totalPrizeCents <= 0) return [];

  // 1. Rider fee (off the top).
  let riderFeeCents = 0;
  if (input.dragonRiderUserId) {
    if (input.riderPaymentMode === "FIXED_AMOUNT") {
      riderFeeCents = Math.min(
        totalPrizeCents,
        Math.round(input.riderPaymentValueDollars * 100),
      );
    } else {
      // PERCENT — clamp the input to [0, 100] inside the validator; defensive here too.
      const pct = Math.max(0, Math.min(100, input.riderPaymentValueDollars));
      riderFeeCents = Math.floor((totalPrizeCents * pct) / 100);
    }
    if (riderFeeCents > 0) {
      const row = ensure(input.dragonRiderUserId);
      row.riderFeeCents = riderFeeCents;
      row.amountCents += riderFeeCents;
    }
  }

  const remainder = totalPrizeCents - riderFeeCents;
  if (remainder <= 0) return Array.from(rows.values());

  // 2. Member share allocation.
  const allocations: Array<{ userId: string; basisPoints: number }> = [];
  if (input.payoutMode === "MANUAL") {
    if (!input.manualAllocations || input.manualAllocations.length === 0) {
      return Array.from(rows.values());
    }
    for (const a of input.manualAllocations) {
      allocations.push({ userId: a.userId, basisPoints: Math.round(a.percent * 100) });
    }
  } else {
    // PROPORTIONAL_BY_SCALES — share by each member's contribution to the
    // pack pool. If the pool is zero (edge case after a mass exodus), fall
    // back to even split among contributors.
    const totalPoints = input.scaleContributions.reduce((s, c) => s + c.points, 0);
    if (totalPoints <= 0) {
      const even = input.scaleContributions.length > 0
        ? Math.floor(10_000 / input.scaleContributions.length)
        : 0;
      for (const c of input.scaleContributions) {
        allocations.push({ userId: c.userId, basisPoints: even });
      }
    } else {
      for (const c of input.scaleContributions) {
        allocations.push({
          userId: c.userId,
          basisPoints: Math.floor((c.points * 10_000) / totalPoints),
        });
      }
    }
  }

  // Distribute by basis points; collect the floor remainder to top up the
  // largest allocation so the totals reconcile to remainder exactly.
  let allocated = 0;
  let largest: { userId: string; basisPoints: number } | null = null;
  for (const a of allocations) {
    const amount = Math.floor((remainder * a.basisPoints) / 10_000);
    const row = ensure(a.userId);
    row.memberShareCents += amount;
    row.amountCents += amount;
    allocated += amount;
    if (!largest || a.basisPoints > largest.basisPoints) largest = a;
  }
  const slack = remainder - allocated;
  if (slack > 0 && largest) {
    const row = ensure(largest.userId);
    row.memberShareCents += slack;
    row.amountCents += slack;
  }

  return Array.from(rows.values());
}
