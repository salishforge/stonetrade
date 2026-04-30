import { z } from "zod/v4";

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/;

export const createPackSchema = z.object({
  name: z.string().min(2).max(64),
  slug: z
    .string()
    .min(2)
    .max(48)
    .regex(SLUG_RE, "Slug must be lowercase letters, digits, and hyphens"),
});

export const updatePackSchema = z.object({
  name: z.string().min(2).max(64).optional(),
});

// Invitations are addressed by email; if the email matches an existing User
// the API resolves and stores their userId so they see the invite in their
// dashboard immediately. Username is accepted as a convenience and resolved
// to email server-side.
export const createInvitationSchema = z
  .object({
    email: z.email().optional(),
    username: z.string().min(1).max(64).optional(),
  })
  .refine((v) => v.email || v.username, {
    message: "Provide either email or username",
  });

export const appointRiderSchema = z.object({
  userId: z.string().min(1),
});

export type CreatePackInput = z.infer<typeof createPackSchema>;
export type UpdatePackInput = z.infer<typeof updatePackSchema>;
export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;
export type AppointRiderInput = z.infer<typeof appointRiderSchema>;
