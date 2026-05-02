import { z } from "zod/v4";

/**
 * Tier shape for a MysteryPack.
 *
 * `MysteryPack.tiers` is stored as JSON in the database (Prisma `Json` field).
 * This module is the single source of truth for what's in that blob — every
 * read and write of the field passes through `tiersSchema.parse()` so we
 * never trust raw JSON. The shape mirrors what the plan in
 * `docs/plans/mystery-packs.md` §3 describes.
 *
 * Design notes:
 *  - `pool` is a list of Listing IDs the seller has reserved into this tier.
 *    Listings transition to status RESERVED_FOR_PACK while the pack is live;
 *    on outcome generation the drawn ones flip to SOLD and the rest stay
 *    reserved until the pack listing closes (Phase 4 sweep).
 *  - `weights` is OPTIONAL. When omitted, draws are uniform over the pool —
 *    that's the simpler default and the one we should ship Phase 1 with.
 *    When provided, it must be the same length as `pool`, all non-negative,
 *    and have a positive sum (otherwise no draw is possible).
 *  - `floor` is the per-slot guaranteed minimum value the SELLER commits to
 *    for cards drawn from this tier. The floor-enforcement worker (Phase 4)
 *    will compare it against the pool's actual minimum market value and
 *    pause listings whose pool no longer covers the floor.
 *  - We never store buyer-EV here. EV is derived from current
 *    `CardMarketValue` snapshots at read time — it changes as the market
 *    moves, while `tiers` is the seller's static commitment.
 */

/**
 * Decimal-as-string. The DB column is `Decimal(10,2)` and Prisma returns
 * Decimal as `Decimal | string`. We accept either at parse time and
 * canonicalize to string so the JSON-stored value matches DB representation.
 *
 * Validating the numeric shape (positive, two decimals at most) is done by
 * the refinement, not by `z.number()`, because we don't want to lose
 * precision through JSON.parse → number → toFixed.
 */
const decimalString = z
  .union([z.string(), z.number()])
  .transform((v) => (typeof v === "number" ? v.toString() : v))
  .pipe(
    z
      .string()
      .regex(/^\d+(\.\d{1,2})?$/, "must be a non-negative dollar amount with at most 2 decimals")
      .refine((s) => Number(s) >= 0, "must be ≥ 0"),
  );

export const packTierSchema = z
  .object({
    /** Display name visible to buyers: "Hit slot", "Rare slot", etc. */
    name: z.string().min(1).max(40),
    /** Cards drawn from this tier into each pack. ≥1; ≤cardCount. */
    slots: z.int().min(1).max(20),
    /** Listing IDs the seller has reserved into this tier. */
    pool: z.array(z.string().min(1)).min(1).max(200),
    /** Optional per-pool draw weights. Same length as `pool` when present. */
    weights: z.array(z.number().nonnegative()).optional(),
    /** Per-slot floor (USD). Enforced against pool's running minimum. */
    floor: decimalString,
  })
  .refine(
    (t) => t.weights == null || t.weights.length === t.pool.length,
    { message: "weights[] must be same length as pool[]" },
  )
  .refine(
    (t) => t.weights == null || t.weights.some((w) => w > 0),
    { message: "weights[] must include at least one positive entry" },
  );

export const tiersSchema = z
  .array(packTierSchema)
  .min(1, "a pack needs at least one tier")
  .max(8, "more than 8 tiers is unmanageable for buyers");

export type PackTier = z.infer<typeof packTierSchema>;
export type PackTiers = z.infer<typeof tiersSchema>;

/**
 * Validate raw JSON from the DB (or an API request). Throws ZodError on
 * malformed input. Callers should always pipe through this rather than
 * casting `mysteryPack.tiers as PackTiers` — the type-cast lies.
 */
export function parseTiers(raw: unknown): PackTiers {
  return tiersSchema.parse(raw);
}

/**
 * Same as parseTiers but returns a result object instead of throwing — for
 * API routes that want to render structured field errors.
 */
export function safeParseTiers(raw: unknown): z.ZodSafeParseResult<PackTiers> {
  return tiersSchema.safeParse(raw);
}

/**
 * The cardCount on a MysteryPack must equal the sum of slots across tiers.
 * This is a separate invariant from the tier shape itself (it requires the
 * pack-level cardCount, which lives on the parent record). Exposed so the
 * builder UI and the API both check it.
 */
export function totalSlotsFromTiers(tiers: PackTiers): number {
  return tiers.reduce((sum, t) => sum + t.slots, 0);
}
