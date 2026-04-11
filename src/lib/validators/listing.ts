import { z } from "zod/v4";

export const createListingSchema = z.object({
  cardId: z.string().min(1, "Card is required"),
  condition: z.enum([
    "MINT",
    "NEAR_MINT",
    "LIGHTLY_PLAYED",
    "MODERATELY_PLAYED",
    "HEAVILY_PLAYED",
    "DAMAGED",
  ]),
  treatment: z.string().min(1, "Treatment is required"),
  price: z.number().positive("Price must be greater than 0").max(99999.99),
  quantity: z.number().int().min(1).max(999).default(1),
  allowOffers: z.boolean().default(true),
  minimumOffer: z.number().positive().max(99999.99).nullable().optional(),
  serialNumber: z.string().nullable().optional(),
  shipsFrom: z.string().nullable().optional(),
  shippingOptions: z
    .array(
      z.object({
        method: z.string(),
        price: z.number().min(0),
      }),
    )
    .nullable()
    .optional(),
});

export const updateListingSchema = z.object({
  price: z.number().positive().max(99999.99).optional(),
  quantity: z.number().int().min(1).max(999).optional(),
  allowOffers: z.boolean().optional(),
  minimumOffer: z.number().positive().max(99999.99).nullable().optional(),
  status: z.enum(["ACTIVE", "CANCELLED"]).optional(),
});

export type CreateListingInput = z.infer<typeof createListingSchema>;
export type UpdateListingInput = z.infer<typeof updateListingSchema>;
