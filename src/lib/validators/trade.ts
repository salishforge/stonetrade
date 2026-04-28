import { z } from "zod/v4";

const conditionEnum = z.enum([
  "MINT",
  "NEAR_MINT",
  "LIGHTLY_PLAYED",
  "MODERATELY_PLAYED",
  "HEAVILY_PLAYED",
  "DAMAGED",
]);

const tradeItemSchema = z.object({
  cardId: z.string().min(1),
  quantity: z.number().int().min(1).max(100).default(1),
  condition: conditionEnum.default("NEAR_MINT"),
  treatment: z.string().min(1),
});

export const createTradeSchema = z
  .object({
    recipientId: z.string().min(1),
    fromProposer: z.array(tradeItemSchema).min(1),
    fromRecipient: z.array(tradeItemSchema).min(1),
    cashAdjustment: z.number().min(-99999.99).max(99999.99).optional(),
    message: z.string().max(500).optional(),
    expiresAt: z.string().datetime().optional(),
  })
  .refine(
    (data) =>
      // Pure swaps with no items at all are nonsensical; we already require
      // ≥1 on each side. Cash-only trades aren't supported here either.
      data.fromProposer.length > 0 && data.fromRecipient.length > 0,
    { message: "Trade must have at least one item on each side" },
  );

export const respondTradeSchema = z.object({
  action: z.enum(["accept", "decline", "withdraw"]),
});

export type CreateTradeInput = z.infer<typeof createTradeSchema>;
export type RespondTradeInput = z.infer<typeof respondTradeSchema>;
