import { z } from "zod/v4";

export const dragonScaleBonusVariantValues = [
  "NONE",
  "AUTOGRAPH",
  "ALT_ART",
  "ECHO",
  "PROMO",
  "ART_PROOF_DIGITAL",
  "PRE_RELEASE_FOIL",
] as const;

// Treatment is derived from Card.treatment server-side, since each treatment
// of a card is its own Card row (uniqueness is on (setId, cardNumber,
// treatment)). The client picks a specific Card.id that already encodes the
// treatment.
export const createDragonScaleSchema = z.object({
  cardId: z.string().min(1, "Card is required"),
  bonusVariant: z.enum(dragonScaleBonusVariantValues).default("NONE"),
  quantity: z.number().int().min(1).max(999).default(1),
  serialNumber: z.string().min(1).max(64).nullable().optional(),
  collectionCardId: z.string().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export const updateDragonScaleSchema = z.object({
  bonusVariant: z.enum(dragonScaleBonusVariantValues).optional(),
  quantity: z.number().int().min(1).max(999).optional(),
  serialNumber: z.string().min(1).max(64).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

// Preview a hypothetical scale before persisting it. Same shape as create
// minus the persistence-only fields, so the client can build a live points
// preview in the AddScaleDialog without committing.
export const previewDragonScaleSchema = z.object({
  cardId: z.string().min(1),
  bonusVariant: z.enum(dragonScaleBonusVariantValues).default("NONE"),
  quantity: z.number().int().min(1).max(999).default(1),
});

export type CreateDragonScaleInput = z.infer<typeof createDragonScaleSchema>;
export type UpdateDragonScaleInput = z.infer<typeof updateDragonScaleSchema>;
export type PreviewDragonScaleInput = z.infer<typeof previewDragonScaleSchema>;
