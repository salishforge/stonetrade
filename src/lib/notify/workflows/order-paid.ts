import { workflow } from "@novu/framework";
import { z } from "zod/v4";

/**
 * Buyer-side confirmation when a Stripe checkout completes. The trigger is
 * fired from `src/app/api/stripe/webhook/route.ts#handleCheckoutCompleted`
 * with the Stripe payment_intent as the idempotency key.
 *
 * The Email step duplicates the existing `renderOrderConfirmationHtml` flow
 * so that during the migration window both paths run in parallel — the
 * direct sendEmail call gets removed once this workflow is verified end-to-
 * end (P2 in docs/novu-setup.md).
 */
export const orderPaidWorkflow = workflow(
  "order-paid",
  async ({ step, payload }) => {
    await step.inApp("buyer-feed", async () => ({
      subject: `Order confirmed — ${payload.cardName}`,
      body: `${payload.quantity}× ${payload.cardName} (${payload.condition}) — $${payload.total}`,
      data: { url: payload.orderUrl },
    }));

    await step.email("buyer-confirmation", async () => ({
      subject: `Order confirmed — ${payload.cardName}`,
      body: [
        `<p>Thanks for your order.</p>`,
        `<p><strong>${payload.quantity}× ${payload.cardName}</strong> (${payload.treatment}, ${payload.condition})</p>`,
        `<p>Total charged: $${payload.total}</p>`,
        `<p><a href="${payload.orderUrl}">View order</a></p>`,
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
      total: z.string(),
      orderUrl: z.url(),
    }),
  },
);
