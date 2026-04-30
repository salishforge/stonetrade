// Pure scoring of a single Dragon Scale row.
//
// The score is intentionally an integer — Prisma stores points as Int and
// the PDF only ever quotes whole numbers. Per-copy fractions from the +35%
// fresher-scale multiplier are floored once at the end so 100 × 1.35 = 135,
// 7 × 1.35 = 9, etc. Multiplying by quantity happens after the floor, so
// quantity 10 of a fresh Stonefoil Common scores 10 × 135 = 1350 (not
// floor(100 × 1.35 × 10)) — both yield the same integer here, but the
// per-copy floor keeps the contribution-per-copy stable in UI breakdowns.

import {
  BASE_POINTS,
  TOKEN_POINTS,
  STONESEEKER_LORE_MULTIPLIER,
  FRESHER_SCALE_MULTIPLIER,
  FRESHER_SCALE_SET_CODES,
  bonusPoints,
  isScoringRarity,
  isScoringTreatment,
} from "./constants";
import type { DragonScaleBonusVariant } from "@/generated/prisma/enums";

export interface ScoringScaleInput {
  treatment: string;
  bonusVariant: DragonScaleBonusVariant;
  quantity: number;
}

export interface ScoringCardInput {
  rarity: string;
  isStoneseeker: boolean;
  isLoreMythic: boolean;
  isToken: boolean;
  set: { code: string };
}

export interface ScoreBreakdown {
  basePerCopy: number;
  bonusPerCopy: number;
  multiplierApplied: number;        // 1, 3, 1.35, 4.05 — composite of the multipliers
  totalPerCopy: number;
  quantity: number;
  total: number;
  reason?: string;                  // populated when score is 0 due to bad input
}

/**
 * Score one Dragon Scale row. Returns a breakdown so UI can show why a card
 * earned what it did. Returns total = 0 with a reason when input is invalid
 * (unknown treatment / rarity for a non-token, etc.) — the engine refuses to
 * guess. Tokens take a separate path with their own treatment-only table.
 */
export function scoreScale(
  scale: ScoringScaleInput,
  card: ScoringCardInput,
): ScoreBreakdown {
  const empty = (reason: string): ScoreBreakdown => ({
    basePerCopy: 0,
    bonusPerCopy: 0,
    multiplierApplied: 1,
    totalPerCopy: 0,
    quantity: scale.quantity,
    total: 0,
    reason,
  });

  if (scale.quantity <= 0) {
    return empty("non-positive quantity");
  }

  if (!isScoringTreatment(scale.treatment)) {
    return empty(`unscored treatment: ${scale.treatment}`);
  }

  // Token path — independent table, no multipliers, no bonus variants.
  // The PDF lists tokens as a separate scoring category and does not
  // mention Lore-Mythic or Stoneseeker tokens; if that ever changes, this
  // branch is the place to add the multiplier.
  if (card.isToken) {
    const basePerCopy = TOKEN_POINTS[scale.treatment] ?? 0;
    return {
      basePerCopy,
      bonusPerCopy: 0,
      multiplierApplied: 1,
      totalPerCopy: basePerCopy,
      quantity: scale.quantity,
      total: basePerCopy * scale.quantity,
    };
  }

  if (!isScoringRarity(card.rarity)) {
    return empty(`unscored rarity: ${card.rarity}`);
  }

  const basePerCopy = BASE_POINTS[card.rarity][scale.treatment];

  // 3x for Stoneseekers and Lore Mythics — only meaningful at Mythic rarity
  // per the PDF footnote ("of other Mythics in the same Treatment").
  let multiplier = 1;
  if (card.rarity === "Mythic" && (card.isStoneseeker || card.isLoreMythic)) {
    multiplier *= STONESEEKER_LORE_MULTIPLIER;
  }

  // +35% for fresher scales. The PDF places this footnote under both the
  // base and bonus tables, so the multiplier applies to the whole per-copy
  // total below — not just the base.
  const isFresh = FRESHER_SCALE_SET_CODES.includes(card.set.code);
  if (isFresh) {
    multiplier *= FRESHER_SCALE_MULTIPLIER;
  }

  const bonusPerCopy = bonusPoints(scale.bonusVariant, scale.treatment, card.rarity);

  // The 3x Stoneseeker/Lore multiplier explicitly does NOT apply to bonus
  // cards (PDF slide 8 footnote); the freshness bonus DOES, since it scopes
  // by card rather than by scoring component. We split the multiplier back
  // out so only freshness rides on the bonus.
  const baseAfterMult =
    card.rarity === "Mythic" && (card.isStoneseeker || card.isLoreMythic)
      ? basePerCopy * STONESEEKER_LORE_MULTIPLIER
      : basePerCopy;
  const bonusAfterMult = bonusPerCopy;
  const freshnessFactor = isFresh ? FRESHER_SCALE_MULTIPLIER : 1;

  const totalPerCopy = Math.floor((baseAfterMult + bonusAfterMult) * freshnessFactor);

  return {
    basePerCopy,
    bonusPerCopy,
    multiplierApplied: multiplier,
    totalPerCopy,
    quantity: scale.quantity,
    total: totalPerCopy * scale.quantity,
  };
}
