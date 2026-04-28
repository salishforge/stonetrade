import { z } from "zod/v4";

export const createOrderSchema = z.object({
  listingId: z.string().min(1),
  quantity: z.number().int().min(1).default(1),
  // When provided, the order's unit price comes from the accepted offer
  // instead of listing.price. Quantity is forced to 1 (offers are per-unit).
  offerId: z.string().min(1).optional(),
  shippingMethod: z.string().min(1),
  shippingAddress: z.object({
    name: z.string().min(1),
    line1: z.string().min(1),
    line2: z.string().optional(),
    city: z.string().min(1),
    state: z.string().min(1),
    zip: z.string().min(1),
    country: z.string().min(1).default("US"),
  }),
});

export const updateOrderSchema = z.object({
  status: z.enum(["SHIPPED", "DELIVERED", "COMPLETED"]).optional(),
  trackingNumber: z.string().optional(),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
