import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { z } from "zod/v4";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";

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

  lineItems.push({
    price_data: {
      currency: "usd",
      product_data: {
        name: cardName,
        ...(description ? { description } : {}),
      },
      unit_amount: Math.round(Number(order.listing.price) * 100),
    },
    quantity: order.quantity,
  });

  if (order.shipping.gt(0)) {
    lineItems.push({
      price_data: {
        currency: "usd",
        product_data: { name: "Shipping" },
        unit_amount: Math.round(Number(order.shipping) * 100),
      },
      quantity: 1,
    });
  }

  const session = await getStripe().checkout.sessions.create({
    mode: "payment",
    line_items: lineItems,
    payment_intent_data: {
      application_fee_amount: Math.round(Number(order.platformFee) * 100),
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
