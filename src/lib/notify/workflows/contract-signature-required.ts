import { workflow } from "@novu/framework";
import { z } from "zod/v4";

/**
 * Pack contract signature request. Fires from
 * `src/app/api/hunting-packs/[id]/contract/versions/route.ts` for every
 * named signatory the moment a new version is proposed. Same workflow
 * handles initial-version sign-offs and re-version sign-offs after a
 * material change (member join/leave, rider change, payout terms).
 */
export const contractSignatureRequiredWorkflow = workflow(
  "contract-signature-required",
  async ({ step, payload }) => {
    await step.inApp("contract-signature-feed", async () => ({
      subject: `Signature required: ${payload.packName} v${payload.versionNumber}`,
      body: `A new version of the ${payload.packName} pack contract needs your signature (role: ${payload.role.replace(/_/g, " ").toLowerCase()}).`,
      data: { url: `/hunting-packs/${payload.packSlug}/contract` },
    }));

    await step.email("contract-signature-email", async () => ({
      subject: `Signature needed on Hunting Pack contract — ${payload.packName} v${payload.versionNumber}`,
      body: [
        `<p>A new version (#${payload.versionNumber}) of the <strong>${payload.packName}</strong> Hunting Pack contract needs your signature.</p>`,
        `<p>Your role on this version: <strong>${payload.role.replace(/_/g, " ").toLowerCase()}</strong></p>`,
        `<p>The contract is not in force until every named party has signed.</p>`,
        `<p><a href="/hunting-packs/${payload.packSlug}/contract">Review and sign</a></p>`,
      ].join(""),
    }));
  },
  {
    payloadSchema: z.object({
      packName: z.string(),
      packSlug: z.string(),
      versionNumber: z.number().int(),
      role: z.enum(["PACK_MEMBER", "DRAGON_RIDER"]),
    }),
  },
);
