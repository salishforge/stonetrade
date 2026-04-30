import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { getStripe } from "@/lib/stripe";
import { CardImage } from "@/components/cards/CardImage";
import type Stripe from "stripe";

interface OrderDetailProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const STATUS_LABEL: Record<string, string> = {
  PENDING_PAYMENT: "Awaiting payment",
  PAID: "Paid",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  COMPLETED: "Completed",
  DISPUTED: "Disputed",
  REFUNDED: "Refunded",
  CANCELLED: "Cancelled",
};

const STATUS_TONE: Record<string, string> = {
  PENDING_PAYMENT: "text-gold",
  PAID: "text-signal-legal",
  SHIPPED: "text-signal-legal",
  DELIVERED: "text-signal-legal",
  COMPLETED: "text-signal-legal",
  DISPUTED: "text-crimson-light",
  REFUNDED: "text-crimson-light",
  CANCELLED: "text-ink-muted",
};

/**
 * Server action for the Pay button. Mirrors the /api/stripe/checkout route's
 * logic but issues a redirect() to Stripe's hosted checkout URL on success.
 * Fails loudly with the error string in the URL when Stripe rejects (no
 * onboarding, bad keys, etc.) so the buyer sees what blocked them.
 */
async function payOrder(formData: FormData) {
  "use server";

  const user = await requireUser();
  const orderId = formData.get("orderId");
  if (typeof orderId !== "string") throw new Error("Missing orderId");

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      listing: { include: { card: { include: { set: true } }, seller: true } },
      buyer: true,
    },
  });
  if (!order) throw new Error("Order not found");
  if (order.buyerId !== user.id) throw new Error("Forbidden");
  if (order.status !== "PENDING_PAYMENT") {
    redirect(`/orders/${order.id}?error=not-pending`);
  }
  if (!order.listing.seller.stripeAccountId) {
    redirect(`/orders/${order.id}?error=seller-not-onboarded`);
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
      product_data: { name: cardName, ...(description ? { description } : {}) },
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

  let session: Stripe.Checkout.Session;
  try {
    session = await getStripe().checkout.sessions.create({
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
  } catch (err) {
    const msg = err instanceof Error ? err.message : "stripe_error";
    redirect(`/orders/${order.id}?error=${encodeURIComponent(msg)}`);
  }

  if (!session.url) {
    redirect(`/orders/${order.id}?error=no-stripe-url`);
  }

  await prisma.order.update({
    where: { id: order.id },
    data: { stripeCheckoutSessionId: session.id },
  });

  redirect(session.url);
}

export default async function OrderDetailPage({ params, searchParams }: OrderDetailProps) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireUser();

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      listing: {
        include: {
          card: { include: { set: true } },
          seller: { select: { username: true, country: true } },
        },
      },
      buyer: { select: { username: true, email: true } },
      seller: { select: { username: true } },
    },
  });
  if (!order) notFound();
  if (order.buyerId !== user.id && order.sellerId !== user.id) {
    notFound();
  }

  const isBuyer = order.buyerId === user.id;
  const errorParam = typeof sp.error === "string" ? sp.error : null;
  const statusParam = typeof sp.status === "string" ? sp.status : null;

  const subtotal = Number(order.subtotal);
  const shipping = Number(order.shipping);
  const total = Number(order.total);
  const fee = Number(order.platformFee);

  const shippingAddress = order.shippingAddress as Record<string, string> | null;

  return (
    <div className="container mx-auto max-w-5xl py-8 px-4">
      <nav className="mb-6 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-muted">
        <Link href="/listings" className="hover:text-gold transition-colors">Dashboard</Link>
        <span className="mx-2">·</span>
        <span className="text-ink-secondary">Order</span>
      </nav>

      <header className="border-b border-border/40 pb-5 mb-8">
        <div className="flex items-baseline justify-between gap-4 flex-wrap">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-muted mb-1">
              Order · <span className="text-ink-secondary">{order.id.slice(0, 12)}</span>
            </p>
            <h1
              className="font-display text-[32px] leading-[1.05] tracking-[-0.012em] text-ink-primary"
              style={{ fontVariationSettings: "'opsz' 64" }}
            >
              {order.listing.card?.name ?? "Order"}
            </h1>
          </div>
          <p className={`font-mono text-[14px] uppercase tracking-[0.12em] ${STATUS_TONE[order.status]}`}>
            {STATUS_LABEL[order.status] ?? order.status}
          </p>
        </div>
      </header>

      {/* Banner: post-Stripe redirect status, or recent error from Pay action. */}
      {(errorParam || statusParam) && (
        <div
          className={`mb-6 px-4 py-3 rounded-md border text-[13px] ${
            errorParam
              ? "border-crimson/40 bg-crimson/5 text-ink-primary"
              : statusParam === "success"
                ? "border-signal-legal/40 bg-signal-legal/5 text-ink-primary"
                : "border-border/60 bg-surface-raised text-ink-secondary"
          }`}
        >
          {errorParam && (
            <>
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-crimson-light mr-2">Payment blocked</span>
              {errorParam.replace(/-/g, " ")}
            </>
          )}
          {statusParam === "success" && "Stripe confirmed your payment — webhook will update this order shortly."}
          {statusParam === "cancelled" && "You cancelled the payment. The order is still open; click Pay to retry."}
        </div>
      )}

      <div className="grid gap-10 lg:grid-cols-[1fr_300px]">
        {/* Order body */}
        <section className="space-y-8 min-w-0">
          <div className="flex gap-4 border border-border/40 rounded-md p-4 bg-surface-raised/40">
            {order.listing.card && (
              <CardImage
                name={order.listing.card.name}
                imageUrl={order.listing.card.imageUrl}
                orbital={order.listing.card.orbital}
                rarity={order.listing.card.rarity}
                className="w-20 shrink-0"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-medium text-ink-primary truncate">
                {order.listing.card?.name ?? "Card"}
              </p>
              <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink-muted mt-0.5">
                {order.listing.card?.set.name}
                {order.listing.card?.cardNumber && <> · {order.listing.card.cardNumber}</>}
                {order.listing.condition && <> · {order.listing.condition.replace("_", " ").toLowerCase()}</>}
                {order.listing.treatment && <> · {order.listing.treatment}</>}
              </p>
              <p className="font-mono text-[12px] tabular-nums text-ink-secondary mt-2">
                ${Number(order.listing.price).toFixed(2)} × {order.quantity}
              </p>
            </div>
          </div>

          {/* Shipping panel */}
          <div>
            <h2 className="font-display text-[18px] text-ink-primary tracking-tight mb-3" style={{ fontVariationSettings: "'opsz' 36" }}>
              Shipping
            </h2>
            <div className="border border-border/40 rounded-md p-4 bg-surface-raised/40 grid grid-cols-2 gap-x-6 gap-y-3 font-mono text-[12px]">
              <div>
                <div className="text-[10px] uppercase tracking-[0.1em] text-ink-muted mb-0.5">Method</div>
                <div className="text-ink-primary capitalize">{order.shippingMethod}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.1em] text-ink-muted mb-0.5">Tracking</div>
                <div className="text-ink-primary">{order.trackingNumber ?? "—"}</div>
              </div>
              <div className="col-span-2">
                <div className="text-[10px] uppercase tracking-[0.1em] text-ink-muted mb-0.5">Address</div>
                <div className="text-ink-primary leading-relaxed">
                  {shippingAddress
                    ? [
                        shippingAddress.name,
                        shippingAddress.line1,
                        shippingAddress.line2,
                        [shippingAddress.city, shippingAddress.state, shippingAddress.zip].filter(Boolean).join(", "),
                        shippingAddress.country,
                      ].filter(Boolean).map((line, i) => <div key={i}>{line}</div>)
                    : "—"}
                </div>
              </div>
            </div>
          </div>

          {/* Timeline panel */}
          <div>
            <h2 className="font-display text-[18px] text-ink-primary tracking-tight mb-3" style={{ fontVariationSettings: "'opsz' 36" }}>
              Timeline
            </h2>
            <ol className="border border-border/40 rounded-md bg-surface-raised/40 divide-y divide-border/40">
              <TimelineRow label="Created" at={order.createdAt} />
              <TimelineRow label="Paid" at={order.paidAt} />
              <TimelineRow label="Shipped" at={order.shippedAt} />
              <TimelineRow label="Delivered" at={order.deliveredAt} />
              <TimelineRow label="Completed" at={order.completedAt} />
            </ol>
          </div>
        </section>

        {/* Action panel */}
        <aside className="lg:sticky lg:top-20 self-start">
          <div className="border border-border/60 rounded-md bg-surface-raised p-5 space-y-4">
            <h2 className="font-display text-[18px] text-ink-primary tracking-tight" style={{ fontVariationSettings: "'opsz' 36" }}>
              Totals
            </h2>
            <dl className="font-mono text-[12px] space-y-1.5">
              <div className="flex justify-between text-ink-secondary tabular-nums">
                <dt>Subtotal</dt><dd>${subtotal.toFixed(2)}</dd>
              </div>
              <div className="flex justify-between text-ink-secondary tabular-nums">
                <dt>Shipping</dt><dd>${shipping.toFixed(2)}</dd>
              </div>
              <div className="flex justify-between text-ink-muted tabular-nums">
                <dt>Platform fee</dt><dd>${fee.toFixed(2)}</dd>
              </div>
              <div className="flex justify-between text-ink-primary text-[14px] tabular-nums pt-2 border-t border-border/40 mt-2">
                <dt>Total</dt><dd>${total.toFixed(2)}</dd>
              </div>
            </dl>

            {isBuyer && order.status === "PENDING_PAYMENT" && (
              <form action={payOrder}>
                <input type="hidden" name="orderId" value={order.id} />
                <button
                  type="submit"
                  className="w-full h-11 rounded-md bg-gold text-[#1a1208] font-medium text-[14px] uppercase tracking-[0.08em] hover:bg-gold-light transition-colors"
                >
                  Pay now
                </button>
                <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-muted text-center mt-2">
                  Redirects to Stripe Checkout
                </p>
              </form>
            )}

            {isBuyer && order.status === "PENDING_PAYMENT" && (
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-muted leading-relaxed">
                Stock is reserved on payment. Other buyers can still claim if you don&apos;t pay.
              </p>
            )}

            {!isBuyer && (
              <p className="font-mono text-[11px] text-ink-secondary leading-relaxed">
                You are the seller on this order. Payment is the buyer&apos;s next step.
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function TimelineRow({ label, at }: { label: string; at: Date | null }) {
  const reached = at !== null;
  return (
    <li className="flex items-baseline justify-between px-4 py-2.5">
      <span className={`font-mono text-[12px] uppercase tracking-[0.1em] ${reached ? "text-ink-primary" : "text-ink-muted"}`}>
        {label}
      </span>
      <span className={`font-mono text-[11px] tabular-nums ${reached ? "text-ink-secondary" : "text-ink-muted"}`}>
        {reached ? at!.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "—"}
      </span>
    </li>
  );
}
