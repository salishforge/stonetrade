import { workflow } from "@novu/framework";
import { z } from "zod/v4";

/**
 * Notify other PENDING offer buyers on a listing when one offer is accepted.
 * Their offers are not auto-rejected (existing product behavior — sellers
 * can still cancel the accepted offer and pick another), but the listing is
 * effectively spoken for. transactionId is the losing offer's id, scoped
 * with an "outbid:" prefix.
 *
 * Fires from `src/app/api/offers/[id]/route.ts` on action="accept".
 */
export const outbidWorkflow = workflow(
  "outbid",
  async ({ step, payload }) => {
    await step.inApp("outbid-feed", async () => ({
      subject: `Outbid on ${payload.cardName}`,
      body: `Seller accepted $${payload.acceptedAmount}. Your offer was $${payload.yourOffer}.`,
      data: { url: payload.listingUrl },
    }));

    await step.email("outbid-email", async () => ({
      subject: `Outbid on ${payload.cardName}`,
      body: [
        `<p>The seller accepted another offer on <strong>${payload.cardName}</strong>.</p>`,
        `<p>Accepted: $${payload.acceptedAmount} · Yours: $${payload.yourOffer}</p>`,
        `<p><a href="${payload.listingUrl}">View listing</a> — you may want to follow up if it falls through.</p>`,
      ].join(""),
    }));
  },
  {
    payloadSchema: z.object({
      offerId: z.string(),
      listingId: z.string(),
      cardName: z.string(),
      yourOffer: z.string(),
      acceptedAmount: z.string(),
      listingUrl: z.url(),
    }),
  },
);
