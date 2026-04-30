import { workflow } from "@novu/framework";
import { z } from "zod/v4";

/**
 * Seller notification when their listing's order is paid. Fires from
 * `src/app/api/stripe/webhook/route.ts` alongside `order-paid` (which goes
 * to the buyer). transactionId is `${payment_intent}:seller` so retried
 * webhooks dedupe independently of the buyer trigger.
 */
export const listingSoldWorkflow = workflow(
  "listing-sold",
  async ({ step, payload }) => {
    await step.inApp("seller-feed", async () => ({
      subject: `Sold: ${payload.cardName}`,
      body: `${payload.buyerUsername} bought ${payload.quantity}× ${payload.cardName} for $${payload.payoutAmount}.`,
      data: { url: payload.orderUrl },
    }));

    await step.email("seller-shipping", async () => ({
      subject: `You sold ${payload.cardName}`,
      body: [
        `<p><strong>${payload.buyerUsername}</strong> just bought your listing.</p>`,
        `<p>${payload.quantity}× ${payload.cardName} (${payload.treatment}, ${payload.condition})</p>`,
        `<p>Payout: $${payload.payoutAmount}.</p>`,
        `<p><a href="${payload.orderUrl}">Mark as shipped</a></p>`,
      ].join(""),
    }));
  },
  {
    payloadSchema: z.object({
      orderId: z.string(),
      cardName: z.string(),
      treatment: z.string(),
      condition: z.string(),
      quantity: z.number().int(),
      buyerUsername: z.string(),
      payoutAmount: z.string(),
      orderUrl: z.url(),
    }),
  },
);
