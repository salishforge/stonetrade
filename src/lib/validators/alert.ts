import { z } from "zod/v4";

export const alertTypes = ["PRICE_DROP", "PRICE_SPIKE", "BACK_IN_STOCK", "META_SHIFT"] as const;

export const createAlertSchema = z
  .object({
    type: z.enum(alertTypes),
    cardId: z.string().min(1).optional(),
    thresholdPct: z.number().positive().max(1000).optional(),
  })
  .refine(
    (data) => {
      // PRICE_DROP / PRICE_SPIKE require a threshold and a card.
      if (data.type === "PRICE_DROP" || data.type === "PRICE_SPIKE") {
        return !!data.cardId && data.thresholdPct !== undefined;
      }
      // BACK_IN_STOCK is per-card; META_SHIFT is account-wide.
      if (data.type === "BACK_IN_STOCK") return !!data.cardId;
      return true;
    },
    { message: "PRICE_DROP/PRICE_SPIKE require cardId + thresholdPct; BACK_IN_STOCK requires cardId" },
  );

export type CreateAlertInput = z.infer<typeof createAlertSchema>;
