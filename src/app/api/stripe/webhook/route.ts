import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { sendEmail } from "@/lib/email/resend";
import { renderOrderConfirmationHtml } from "@/lib/email/templates/order-confirmation";
import { triggerNotification } from "@/lib/notify/novu";
import { recalculateCardValue } from "@/lib/pricing/recalculate";

export const runtime = "nodejs";

async function handleDispute(dispute: Stripe.Dispute) {
  const paymentIntentId =
    typeof dispute.payment_intent === "string" ? dispute.payment_intent : null;
  if (!paymentIntentId) return;

  const order = await prisma.order.findFirst({
    where: { stripePaymentIntentId: paymentIntentId },
  });
  if (!order) {
    console.warn(`Order not found for disputed charge: ${dispute.id}`);
    return;
  }

  // Idempotent: stripe re-sends events; skip when already in a terminal state.
  // REFUNDED is also terminal — if the customer was already made whole, the
  // dispute is moot for our records.
  if (order.status === "DISPUTED" || order.status === "REFUNDED") return;

  await prisma.order.update({
    where: { id: order.id },
    data: { status: "DISPUTED" },
  });
}

async function handleAccountUpdated(account: Stripe.Account) {
  // Update the cached onboarding flag on the seller's User row. We don't
  // create a User if none exists — the account is owned by Stripe, but
  // stonetrade only cares once we've linked it to a stonetrade User via
  // /api/stripe/connect/onboard.
  const onboardingComplete = !!(account.charges_enabled && account.payouts_enabled);
  await prisma.user.updateMany({
    where: { stripeAccountId: account.id },
    data: { stripeOnboardingComplete: onboardingComplete },
  });
}

async function handlePaymentIntentFailed(intent: Stripe.PaymentIntent) {
  const order = await prisma.order.findFirst({
    where: { stripePaymentIntentId: intent.id },
  });
  if (!order) return;
  // Only PENDING_PAYMENT orders react to a failed intent. Anything else has
  // already been resolved and shouldn't be flipped backward.
  if (order.status !== "PENDING_PAYMENT") return;
  await prisma.order.update({
    where: { id: order.id },
    data: { status: "CANCELLED" },
  });
}

async function handleChargeRefunded(charge: Stripe.Charge) {
  const paymentIntentId =
    typeof charge.payment_intent === "string" ? charge.payment_intent : null;
  if (!paymentIntentId) return;

  const order = await prisma.order.findFirst({
    where: { stripePaymentIntentId: paymentIntentId },
  });
  if (!order) {
    console.warn(`Order not found for refunded charge: ${charge.id}`);
    return;
  }

  // Skip when already REFUNDED (idempotent) OR when CANCELLED — our own
  // oversell flow marks CANCELLED before issuing the refund itself; the
  // resulting charge.refunded event would otherwise overwrite that label.
  // CANCELLED is the more informative state for an order that never made
  // it to PAID in our system.
  if (order.status === "REFUNDED" || order.status === "CANCELLED") return;

  await prisma.order.update({
    where: { id: order.id },
    data: { status: "REFUNDED" },
  });
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const order = await prisma.order.findUnique({
    where: { stripeCheckoutSessionId: session.id },
    include: {
      // Seller is needed for the listing-sold notification fan-out below.
      // Pulled in the same query to avoid a second round-trip on every paid
      // order — Prisma serializes it into the same SELECT.
      listing: { include: { card: true, seller: true } },
      buyer: true,
    },
  });

  if (!order) {
    console.warn(`Order not found for Stripe checkout session: ${session.id}`);
    return;
  }

  // Idempotent: only PENDING_PAYMENT orders need processing. PAID orders were
  // already handled; CANCELLED orders had a refund issued and shouldn't refund
  // again on retry.
  if (order.status !== "PENDING_PAYMENT") return;

  const listing = order.listing;
  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : null;

  // Atomically claim stock and finalize the order in one transaction. Raw SQL
  // for the listing update because we need a conditional WHERE on a computed
  // expression (quantity - quantitySold >= order.quantity) that Prisma's typed
  // updateMany cannot express. If the claim fails (concurrent orders sold the
  // listing out between checkout-session creation and payment), the
  // transaction returns false and we fall through to the refund path.
  const claimed = await prisma.$transaction(async (tx) => {
    const rows = await tx.$executeRaw`
      UPDATE "Listing"
      SET "quantitySold" = "quantitySold" + ${order.quantity},
          "status" = CASE
            WHEN "quantity" - "quantitySold" - ${order.quantity} <= 0
              THEN 'SOLD'::"ListingStatus"
            ELSE "status"
          END
      WHERE "id" = ${listing.id} AND "quantity" - "quantitySold" >= ${order.quantity}
    `;

    if (rows === 0) return false;

    await tx.order.update({
      where: { id: order.id },
      data: {
        status: "PAID",
        paidAt: new Date(),
        stripePaymentIntentId: paymentIntentId,
      },
    });

    if (listing.cardId) {
      await tx.priceDataPoint.create({
        data: {
          cardId: listing.cardId,
          source: "COMPLETED_SALE",
          price: listing.price,
          condition: listing.condition ?? "NEAR_MINT",
          treatment: listing.treatment ?? "Classic Paper",
          listingId: listing.id,
          verified: true,
        },
      });
    }

    return true;
  });

  if (!claimed) {
    // Stock was insufficient at the moment payment cleared. Record CANCELLED
    // first so the order's final state is durable even if the Stripe refund
    // call later fails (manual reconciliation in that case).
    await prisma.order.update({
      where: { id: order.id },
      data: { status: "CANCELLED", stripePaymentIntentId: paymentIntentId },
    });

    if (paymentIntentId) {
      try {
        await getStripe().refunds.create({
          payment_intent: paymentIntentId,
          reason: "requested_by_customer",
        });
      } catch (err) {
        console.error("Refund failed for oversold order:", order.id, err);
      }
    } else {
      console.error("Cannot refund oversold order — no payment_intent on session", session.id);
    }
    return;
  }

  // Send buyer confirmation. Resend is gated on RESEND_API_KEY at the boundary;
  // sendEmail returns null in dev when unconfigured. Wrapped so an email outage
  // does not roll back a paid order.
  try {
    const { subject, html } = renderOrderConfirmationHtml({
      orderId: order.id,
      cardName: listing.card?.name ?? "Listing",
      treatment: listing.treatment ?? "Classic Paper",
      condition: listing.condition ?? "NEAR_MINT",
      quantity: order.quantity,
      subtotal: order.subtotal.toFixed(2),
      shipping: order.shipping.toFixed(2),
      total: order.total.toFixed(2),
      shippingAddress: order.shippingAddress as Record<string, string> | null,
      appBaseUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    });
    await sendEmail({ to: order.buyer.email, subject, html });
  } catch (err) {
    console.error("Order confirmation email failed:", err);
  }

  // Novu: fan out the same "order paid" event to in-app + (eventually) other
  // channels via the dashboard-defined "order-paid" workflow. No-op when
  // NOVU_API_KEY is unset. Runs alongside the direct sendEmail call above
  // during the migration period — the Novu workflow's email step duplicates
  // the Resend send only once we cut Resend over to Novu and turn off this
  // direct call (P2 in the scoping doc). Idempotency key is the Stripe
  // payment_intent so retried webhooks don't double-fire.
  const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  await triggerNotification({
    workflowId: "order-paid",
    to: {
      id: order.buyer.id,
      email: order.buyer.email,
      username: order.buyer.username,
    },
    payload: {
      orderId: order.id,
      cardName: listing.card?.name ?? "Listing",
      treatment: listing.treatment ?? "Classic Paper",
      condition: listing.condition ?? "NEAR_MINT",
      quantity: order.quantity,
      total: order.total.toFixed(2),
      orderUrl: `${appBaseUrl}/orders/${order.id}`,
    },
    transactionId: paymentIntentId ?? undefined,
  });

  // Notify the seller their listing sold. Distinct workflow from order-paid
  // so seller-specific channels and content (shipping reminder, payout ETA)
  // can diverge from buyer's confirmation. transactionId reuses the same
  // payment_intent + a `:seller` suffix so retried webhooks still de-dupe
  // independently of the buyer trigger.
  await triggerNotification({
    workflowId: "listing-sold",
    to: {
      id: listing.seller.id,
      email: listing.seller.email,
      username: listing.seller.username,
    },
    payload: {
      orderId: order.id,
      cardName: listing.card?.name ?? "Listing",
      treatment: listing.treatment ?? "Classic Paper",
      condition: listing.condition ?? "NEAR_MINT",
      quantity: order.quantity,
      buyerUsername: order.buyer.username,
      payoutAmount: order.total.toFixed(2),
      orderUrl: `${appBaseUrl}/listings/orders/${order.id}`,
    },
    transactionId: paymentIntentId ? `${paymentIntentId}:seller` : undefined,
  });

  // Refresh CardMarketValue (totals + scarcity drift on every PAID order).
  // Wrapped so a recompute outage does not roll back the paid order.
  if (listing.cardId) {
    try {
      await recalculateCardValue(listing.cardId);
    } catch (err) {
      console.error("CardMarketValue recompute failed for", listing.cardId, err);
    }
  }
}

export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  const rawBody = await request.text();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secret) {
    console.error("STRIPE_WEBHOOK_SECRET is not configured");
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch (err: unknown) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
      break;
    case "charge.dispute.created":
      await handleDispute(event.data.object as Stripe.Dispute);
      break;
    case "charge.refunded":
      await handleChargeRefunded(event.data.object as Stripe.Charge);
      break;
    case "account.updated":
      await handleAccountUpdated(event.data.object as Stripe.Account);
      break;
    case "payment_intent.payment_failed":
      await handlePaymentIntentFailed(event.data.object as Stripe.PaymentIntent);
      break;
    default:
      console.info("Unhandled Stripe event:", event.type);
  }

  return NextResponse.json({ received: true });
}
