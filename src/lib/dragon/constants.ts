// Dragon Cup 2026 scoring constants.
//
// All numbers below come straight from `dragon_cup.pdf` (slides 6–8). They are
// the single source of truth for the scoring engine in `score-scale.ts` —
// route handlers, UI, and any future cron should never hard-code their own
// copies. When the official spec changes, edit this file and run the recalc
// endpoint to refresh cached scale points.

import { DragonScaleBonusVariant } from "@/generated/prisma/enums";

export const DRAGON_POINT_THRESHOLD = 10_000;

// Treatments eligible to score Dragon Points. The catalog also has "Classic
// Paper" (the non-foil base print), which is intentionally excluded — paper
// cards are not Dragon Scales.
export const SCORING_TREATMENTS = [
  "Classic Foil",
  "Formless Foil",
  "OCM",
  "Stonefoil",
] as const;
export type ScoringTreatment = (typeof SCORING_TREATMENTS)[number];

export const SCORING_RARITIES = [
  "Common",
  "Uncommon",
  "Rare",
  "Epic",
  "Mythic",
] as const;
export type ScoringRarity = (typeof SCORING_RARITIES)[number];

// PDF slide 7. Indexed [rarity][treatment].
export const BASE_POINTS: Record<ScoringRarity, Record<ScoringTreatment, number>> = {
  Common:   { "Classic Foil": 1, "Formless Foil": 2,  OCM: 10, Stonefoil: 100 },
  Uncommon: { "Classic Foil": 2, "Formless Foil": 3,  OCM: 15, Stonefoil: 150 },
  Rare:     { "Classic Foil": 3, "Formless Foil": 4,  OCM: 20, Stonefoil: 200 },
  Epic:     { "Classic Foil": 4, "Formless Foil": 5,  OCM: 25, Stonefoil: 250 },
  Mythic:   { "Classic Foil": 7, "Formless Foil": 15, OCM: 75, Stonefoil: 500 },
};

// Token cards have their own treatment-only table (PDF slide 8).
export const TOKEN_POINTS: Record<ScoringTreatment, number> = {
  "Classic Foil": 0,
  "Formless Foil": 1,
  OCM: 5,
  Stonefoil: 50,
};

// Stoneseekers and the Mythics featured in the official lore earn 3x the
// base treatment points (PDF slide 7 footnote). The footnote scopes this to
// "Mythics in the same Treatment", so the engine only applies the multiplier
// when the card's rarity is Mythic — otherwise the flag is recorded but
// ignored, matching the most conservative reading.
export const STONESEEKER_LORE_MULTIPLIER = 3;

// Cards published in Call of the Stones and Set 3 earn an additional 35% on
// top of their final per-copy score (PDF slides 7 + 8 footnotes).
//
// "CotS" is the canonical Call of the Stones set code as carried by the
// Wonders platform sync (see src/lib/platform/sync.ts) and seeded into
// `Set.code`. Set 3 has not been announced as of the 2026-04-30 PDF
// revision; "SET3" is a placeholder that should be replaced with the
// real code once published — until then, no card matches and no bonus
// fires for that set.
export const FRESHER_SCALE_MULTIPLIER = 1.35;
export const FRESHER_SCALE_SET_CODES: ReadonlyArray<string> = ["CotS", "SET3"];

// Rarity bands used by several bonus tables.
const COMMON_TO_RARE: ReadonlyArray<ScoringRarity> = ["Common", "Uncommon", "Rare"];
const EPIC_TO_MYTHIC: ReadonlyArray<ScoringRarity> = ["Epic", "Mythic"];

/**
 * Bonus points awarded by (variant, treatment, rarity). A return value of 0
 * means the variant earns no bonus in that combination per PDF slide 8;
 * `null` means the combination is undefined in the spec and the engine
 * should fall back to 0 (treated identically here, but split conceptually).
 *
 * Tokens are scored separately and never call into this table.
 */
export function bonusPoints(
  variant: DragonScaleBonusVariant,
  treatment: ScoringTreatment,
  rarity: ScoringRarity,
): number {
  switch (variant) {
    case "NONE":
      return 0;

    // PDF slide 8: "+500 Any Rarity, Any Treatment". The footnote excludes
    // the Stoneseeker/Lore-Mythic 3x multiplier from bonus cards; that's
    // enforced by score-scale never passing the multiplier into bonuses.
    case "AUTOGRAPH":
      return 500;

    // PDF slide 8 — Pack Pulled Alt Arts. Numbers vary by treatment + rarity
    // band. Classic Foil is flat across rarities; Stonefoil is flat too.
    case "ALT_ART":
      if (treatment === "Classic Foil") return 3;
      if (treatment === "Stonefoil") return 100;
      if (treatment === "Formless Foil") {
        if (COMMON_TO_RARE.includes(rarity)) return 5;
        if (EPIC_TO_MYTHIC.includes(rarity)) return 15;
        return 0;
      }
      if (treatment === "OCM") {
        if (COMMON_TO_RARE.includes(rarity)) return 10;
        if (EPIC_TO_MYTHIC.includes(rarity)) return 25;
        return 0;
      }
      return 0;

    // PDF slide 8 — Pack Pulled Echoes. Treatment-agnostic.
    case "ECHO":
      if (COMMON_TO_RARE.includes(rarity)) return 5;
      if (rarity === "Epic") return 15;
      if (rarity === "Mythic") return 25;
      return 0;

    // PDF slide 8 — Prizes & Promos (not pack pulled): +10 for anything
    // released in the most recent two-year timeline. The "two-year window"
    // check is not enforced here in Phase 1; the user-declared variant is
    // taken at face value, with audit deferred to event check-in.
    case "PROMO":
      return 10;

    // PDF slide 8 — Digital Wonders Art Proofs.
    case "ART_PROOF_DIGITAL":
      switch (rarity) {
        case "Common":   return 50;
        case "Uncommon": return 100;
        case "Rare":     return 150;
        case "Epic":     return 200;
        case "Mythic":   return 250;
        default:         return 0;
      }

    // PDF slide 8 — Existence Pre-Release Foil Proofs.
    case "PRE_RELEASE_FOIL":
      if (COMMON_TO_RARE.includes(rarity)) return 10;
      if (rarity === "Epic") return 15;
      if (rarity === "Mythic") return 25;
      return 0;

    default:
      return 0;
  }
}

/** Treatment is one we score for Dragon Points (excludes Classic Paper). */
export function isScoringTreatment(value: string): value is ScoringTreatment {
  return (SCORING_TREATMENTS as ReadonlyArray<string>).includes(value);
}

/** Rarity is one of the five recognised Dragon Cup tiers. */
export function isScoringRarity(value: string): value is ScoringRarity {
  return (SCORING_RARITIES as ReadonlyArray<string>).includes(value);
}
