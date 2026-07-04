import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import Decimal from "decimal.js";
import { z } from "zod/v4";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";

/**
 * Convert a money value to integer cents for Stripe. Goes through
 * decimal.js so we don't lose precision in `Number(...) * 100` and don't
 * have to trust `Math.round` to do the right thing on values that round
 * away from zero. ROUND_HALF_EVEN ("banker's rounding") matches Stripe's
 * documented rounding behaviour.
 */
function toCents(value: Decimal | string | number): number {
  return new Decimal(value.toString())
    .times(100)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN)
    .toNumber();
}

const checkoutSchema = z.object({
  orderId: z.string().cuid(),
});

export async function POST(request: NextRequest) {
  const user = await requireUser();
  const body = await request.json();
  const parsed = checkoutSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.issues }, { status: 400 });
  }

  const { orderId } = parsed.data;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      listing: {
        include: {
          card: { include: { set: true } },
          seller: true,
        },
      },
      buyer: true,
    },
  });

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  if (order.buyerId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (order.status !== "PENDING_PAYMENT") {
    return NextResponse.json({ error: "Order not awaiting payment" }, { status: 409 });
  }

  if (!order.listing.seller.stripeAccountId) {
    return NextResponse.json({ error: "Seller has not completed Stripe Connect onboarding" }, { status: 503 });
  }

  // Re-check stock at checkout time. The order was created earlier with a stock
  // check, but other orders may have sold the listing out since. The webhook
  // also has an atomic stock check on payment that issues a refund if needed —
  // this pre-check is the friendlier "fail fast" path that avoids sending the
  // buyer to Stripe at all when we already know fulfillment is impossible.
  const available = order.listing.quantity - order.listing.quantitySold;
  if (order.quantity > available) {
    await prisma.order.update({
      where: { id: order.id },
      data: { status: "CANCELLED" },
    });
    return NextResponse.json(
      { error: `Listing no longer has enough stock (${available} available, ${order.quantity} requested)` },
      { status: 409 },
    );
  }

  const lineItems: Stripe.Checkout.SessionCreateParams["line_items"] = [];

  const cardName = order.listing.card?.name || `Listing ${order.listing.id}`;
  const descriptionParts = [
    order.listing.card?.set?.name,
    order.listing.treatment,
    order.listing.condition,
  ].filter(Boolean);
  const description = descriptionParts.length > 0 ? descriptionParts.join(" • ") : undefined;

  // Use the snapshotted subtotal (taken at order creation time) as a single
  // line-item with quantity=1, NOT order.listing.price × order.quantity.
  // Otherwise a seller can raise the listing price between order creation
  // and the buyer hitting "pay" and the buyer ends up paying the new price.
  // Since order.subtotal already encodes price × quantity that the buyer
  // agreed to, expressing it as one line item with quantity=1 is honest.
  lineItems.push({
    price_data: {
      currency: "usd",
      product_data: {
        name: order.quantity > 1 ? `${cardName} ×${order.quantity}` : cardName,
        ...(description ? { description } : {}),
      },
      unit_amount: toCents(order.subtotal),
    },
    quantity: 1,
  });

  if (order.shipping.gt(0)) {
    lineItems.push({
      price_data: {
        currency: "usd",
        product_data: { name: "Shipping" },
        unit_amount: toCents(order.shipping),
      },
      quantity: 1,
    });
  }

  const session = await getStripe().checkout.sessions.create({
    mode: "payment",
    line_items: lineItems,
    payment_intent_data: {
      application_fee_amount: toCents(order.platformFee),
      transfer_data: { destination: order.listing.seller.stripeAccountId },
      metadata: { orderId: order.id },
    },
    metadata: { orderId: order.id },
    success_url: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/orders/${order.id}?status=success`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/orders/${order.id}?status=cancelled`,
    customer_email: order.buyer.email,
  });

  if (!session.url) {
    return NextResponse.json({ error: "Stripe did not return a checkout URL" }, { status: 502 });
  }

  await prisma.order.update({
    where: { id: order.id },
    data: { stripeCheckoutSessionId: session.id },
  });

  return NextResponse.json({ data: { url: session.url, sessionId: session.id } });
}
