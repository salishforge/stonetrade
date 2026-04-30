import { z } from "zod/v4";

// A new contract version is proposed with the rules; named members + rider
// are derived from the pack's current membership and the rider field.
//
// payoutMode + rider terms drive distribution at tournament-result time:
// - MANUAL keeps the manualAllocations array as the authoritative split
// - PROPORTIONAL_BY_SCALES distributes by each member's % of pack scale
//   points contribution, after rider payment has been deducted
//
// riderPaymentMode + value:
// - FIXED_AMOUNT: riderPaymentValue = USD (Decimal); deducted from prize
// - PERCENT: riderPaymentValue = 0..100; deducted as % of prize
export const proposeVersionSchema = z
  .object({
    payoutMode: z.enum(["MANUAL", "PROPORTIONAL_BY_SCALES"]),
    riderPaymentMode: z.enum(["FIXED_AMOUNT", "PERCENT"]),
    riderPaymentValue: z.number().min(0).max(99_999_999),
    dragonRiderUserId: z.string().min(1).nullable().optional(),
    manualAllocations: z
      .array(
        z.object({
          userId: z.string().min(1),
          percent: z.number().min(0).max(100),
        }),
      )
      .optional(),
    notes: z.string().max(2000).optional(),
  })
  .refine(
    (v) => {
      if (v.riderPaymentMode === "PERCENT") return v.riderPaymentValue <= 100;
      return true;
    },
    { message: "Rider PERCENT must be 0..100" },
  )
  .refine(
    (v) => {
      if (v.payoutMode !== "MANUAL") return true;
      if (!v.manualAllocations || v.manualAllocations.length === 0) return false;
      const sum = v.manualAllocations.reduce((s, a) => s + a.percent, 0);
      // Allow tiny floating-point slack — the engine renormalises anyway.
      return Math.abs(sum - 100) < 0.01;
    },
    {
      message: "manualAllocations must sum to 100% when payoutMode = MANUAL",
    },
  );

export type ProposeVersionInput = z.infer<typeof proposeVersionSchema>;
