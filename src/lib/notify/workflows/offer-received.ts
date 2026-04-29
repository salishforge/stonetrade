import { workflow } from "@novu/framework";
import { z } from "zod/v4";

/**
 * Seller notification when a buyer places an offer on their listing. Fires
 * from `src/app/api/offers/route.ts#POST`. transactionId is the offer.id.
 */
export const offerReceivedWorkflow = workflow(
  "offer-received",
  async ({ step, payload }) => {
    await step.inApp("seller-offer-feed", async () => ({
      subject: `Offer: $${payload.offerAmount} on ${payload.cardName}`,
      body: payload.message
        ? `${payload.buyerUsername}: "${payload.message}"`
        : `${payload.buyerUsername} offered $${payload.offerAmount} (asking: $${payload.listingPrice}).`,
      data: { url: payload.offerUrl },
    }));

    await step.email("seller-offer-email", async () => ({
      subject: `New offer on ${payload.cardName}`,
      body: [
        `<p><strong>${payload.buyerUsername}</strong> offered <strong>$${payload.offerAmount}</strong> on your listing.</p>`,
        `<p>Asking: $${payload.listingPrice}</p>`,
        payload.message ? `<blockquote>${payload.message}</blockquote>` : "",
        `<p><a href="${payload.offerUrl}">Respond to offer</a></p>`,
      ].join(""),
    }));
  },
  {
    payloadSchema: z.object({
      offerId: z.string(),
      listingId: z.string(),
      cardName: z.string(),
      buyerUsername: z.string(),
      offerAmount: z.string(),
      listingPrice: z.string(),
      message: z.string(),
      offerUrl: z.url(),
    }),
  },
);
