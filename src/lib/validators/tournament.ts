import { z } from "zod/v4";

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/;

export const createTournamentSchema = z.object({
  name: z.string().min(2).max(96),
  slug: z.string().min(2).max(48).regex(SLUG_RE),
  description: z.string().max(2000).optional(),
  eventDate: z.iso.datetime(),
  basePrizePool: z.number().min(0).max(99_999_999.99),
  dragonGoldPool: z.number().min(0).max(99_999_999.99),
  status: z
    .enum(["UPCOMING", "REGISTRATION_OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED"])
    .default("UPCOMING"),
});

export const updateTournamentSchema = createTournamentSchema.partial();

// Register a Dragon for a tournament. dragonRegistrationId identifies the
// Dragon in the Stable; rider is the Stoneseeker who'll compete on its
// behalf. declaredPoints is the hunter-stated point total — may be lower
// than actual to give a safety margin against accidental over-declaration
// (PDF slide 13).
export const registerDragonSchema = z.object({
  dragonRegistrationId: z.string().min(1),
  dragonRiderUserId: z.string().min(1),
  declaredPoints: z.number().int().min(1).max(10_000_000),
});

// Admin endpoint for entering finishing results. Each entry is one finisher;
// the engine fills in multiplier + weighted + payouts.
export const enterResultsSchema = z.object({
  results: z
    .array(
      z.object({
        registrationId: z.string().min(1),
        finishingPosition: z.number().int().min(1),
      }),
    )
    .min(1),
});

export type CreateTournamentInput = z.infer<typeof createTournamentSchema>;
export type RegisterDragonInput = z.infer<typeof registerDragonSchema>;
export type EnterResultsInput = z.infer<typeof enterResultsSchema>;
