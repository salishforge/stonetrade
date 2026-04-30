// Random invite tokens. 32 random bytes (256 bits of entropy) base64-url
// encoded — 43 chars, URL-safe, no padding. Collisions are negligible at
// any scale this app will reach; the unique constraint on PackInvitation
// catches the impossible case.

import { randomBytes } from "node:crypto";

export function generateInvitationToken(): string {
  return randomBytes(32).toString("base64url");
}

// 7-day default. Long enough that an invitee can sit on the email over a
// weekend; short enough that abandoned invites don't litter the table.
export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function invitationExpiry(): Date {
  return new Date(Date.now() + INVITATION_TTL_MS);
}
