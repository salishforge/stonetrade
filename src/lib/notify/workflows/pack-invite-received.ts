import { workflow } from "@novu/framework";
import { z } from "zod/v4";

/**
 * Hunting Pack invitation. Fires from
 * `src/app/api/hunting-packs/[id]/invitations/route.ts` when an invitation
 * is sent and the inviteeUserId is known. Pre-signup invites (email-only,
 * no resolved user) skip notification because there's no Novu subscriber to
 * route to.
 */
export const packInviteReceivedWorkflow = workflow(
  "pack-invite-received",
  async ({ step, payload }) => {
    await step.inApp("pack-invite-feed", async () => ({
      subject: `Pack invitation: ${payload.packName}`,
      body: `${payload.inviterUsername} invited you to join Hunting Pack "${payload.packName}".`,
      data: { url: `/invitations/${payload.token}` },
    }));

    await step.email("pack-invite-email", async () => ({
      subject: `You've been invited to Hunting Pack ${payload.packName}`,
      body: [
        `<p><strong>${payload.inviterUsername}</strong> invited you to join the Hunting Pack <strong>${payload.packName}</strong> on StoneTrade.</p>`,
        `<p>Pooling Dragon Scales with packmates is the fastest way to register a Dragon for the Dragon Cup.</p>`,
        `<p><a href="/invitations/${payload.token}">Open invitation</a></p>`,
      ].join(""),
    }));
  },
  {
    payloadSchema: z.object({
      packName: z.string(),
      packSlug: z.string(),
      token: z.string(),
      inviterUsername: z.string(),
    }),
  },
);
