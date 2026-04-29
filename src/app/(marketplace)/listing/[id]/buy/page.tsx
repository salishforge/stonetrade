import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { createOrderSchema } from "@/lib/validators/order";
import { PLATFORM_FEE_PERCENT } from "@/lib/stripe";
import { CardImage } from "@/components/cards/CardImage";

interface BuyPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

interface ShippingOption {
  method: string;
  price: number;
}

/**
 * Server action: validates input, creates an Order with status PENDING_PAYMENT,
 * redirects the buyer to /orders/[id] for the payment step. Stock is also
 * checked at checkout-create time and again at webhook-claim time, so a race
 * here would be caught downstream.
 */
async function placeOrder(formData: FormData) {
  "use server";

  const user = await requireUser();
  const listingId = formData.get("listingId");
  if (typeof listingId !== "string") throw new Error("Missing listingId");

  const parsed = createOrderSchema.safeParse({
    listingId,
    quantity: Number(formData.get("quantity") ?? 1),
    shippingMethod: formData.get("shippingMethod"),
    shippingAddress: {
      name: formData.get("addr_name"),
      line1: formData.get("addr_line1"),
      line2: formData.get("addr_line2") || undefined,
      city: formData.get("addr_city"),
      state: formData.get("addr_state"),
      zip: formData.get("addr_zip"),
      country: formData.get("addr_country") || "US",
    },
  });
  if (!parsed.success) {
    throw new Error("Validation failed: " + parsed.error.issues.map((i) => i.message).join("; "));
  }
  const input = parsed.data;

  const listing = await prisma.listing.findUnique({
    where: { id: input.listingId },
    include: { seller: { select: { id: true } } },
  });
  if (!listing || listing.status !== "ACTIVE") throw new Error("Listing not available");
  if (listing.sellerId === user.id) throw new Error("Cannot buy your own listing");
  const available = listing.quantity - listing.quantitySold;
  if (input.quantity > available) throw new Error(`Only ${available} available`);

  const shippingOptions = listing.shippingOptions as ShippingOption[] | null;
  const shippingOption = shippingOptions?.find((o) => o.method === input.shippingMethod);
  const shippingCost = shippingOption?.price ?? 0;

  const subtotal = Number(listing.price) * input.quantity;
  const platformFee = subtotal * (PLATFORM_FEE_PERCENT / 100);
  const total = subtotal + shippingCost;

  const order = await prisma.order.create({
    data: {
      listingId: listing.id,
      buyerId: user.id,
      sellerId: listing.sellerId,
      quantity: input.quantity,
      subtotal,
      shipping: shippingCost,
      platformFee,
      total,
      shippingMethod: input.shippingMethod,
      shippingAddress: input.shippingAddress,
      status: "PENDING_PAYMENT",
    },
  });

  redirect(`/orders/${order.id}`);
}

export default async function BuyPage({ params, searchParams }: BuyPageProps) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireUser();

  const listing = await prisma.listing.findUnique({
    where: { id },
    include: {
      card: {
        include: {
          set: { select: { name: true, code: true } },
          marketValue: { select: { marketMid: true } },
        },
      },
      seller: { select: { id: true, username: true, stripeAccountId: true } },
    },
  });
  if (!listing) notFound();

  // Pre-flight checks. We render a friendly page rather than a 4xx so the
  // buyer sees what blocks them.
  const blockers: string[] = [];
  if (listing.status !== "ACTIVE") blockers.push("This listing is no longer active.");
  if (listing.sellerId === user.id) blockers.push("This is your own listing — you can't buy from yourself.");
  const available = listing.quantity - listing.quantitySold;
  if (available <= 0) blockers.push("This listing is sold out.");

  const shippingOptions = (listing.shippingOptions as ShippingOption[] | null) ?? [];
  const requestedQty = Math.min(
    Math.max(1, Number(sp.qty) || 1),
    Math.max(1, available),
  );
  const unitPrice = Number(listing.price);
  const initialShipping = shippingOptions[0]?.price ?? 0;
  const previewSubtotal = unitPrice * requestedQty;
  const previewTotal = previewSubtotal + initialShipping;

  return (
    <div className="container mx-auto max-w-5xl py-8 px-4">
      <nav className="mb-6 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-muted">
        <Link href="/browse" className="hover:text-gold transition-colors">Browse</Link>
        {listing.card && (
          <>
            <span className="mx-2">·</span>
            <Link href={`/card/${listing.card.id}`} className="hover:text-gold transition-colors">
              {listing.card.set.code} · {listing.card.cardNumber}
            </Link>
            <span className="mx-2">·</span>
            <Link href={`/listing/${listing.id}`} className="hover:text-gold transition-colors">
              Listing
            </Link>
          </>
        )}
        <span className="mx-2">·</span>
        <span className="text-ink-secondary">Checkout</span>
      </nav>

      <header className="border-b border-border/40 pb-5 mb-8">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-muted mb-1">Checkout</p>
        <h1
          className="font-display text-[32px] leading-[1.05] tracking-[-0.012em] text-ink-primary"
          style={{ fontVariationSettings: "'opsz' 64" }}
        >
          Confirm your purchase
        </h1>
      </header>

      {blockers.length > 0 ? (
        <div className="border border-crimson/40 bg-crimson/5 rounded-md p-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-crimson-light mb-2">Cannot continue</p>
          <ul className="text-[14px] text-ink-primary leading-relaxed space-y-1">
            {blockers.map((b, i) => <li key={i}>· {b}</li>)}
          </ul>
          <Link
            href={`/listing/${listing.id}`}
            className="inline-block mt-4 text-[12px] uppercase tracking-[0.12em] text-gold hover:text-gold-light transition-colors"
          >
            ← Back to listing
          </Link>
        </div>
      ) : (
        <form action={placeOrder} className="grid gap-10 lg:grid-cols-[1fr_320px]">
          <input type="hidden" name="listingId" value={listing.id} />

          {/* Form fields */}
          <section className="space-y-8 min-w-0">
            {/* Quantity */}
            <FormBlock label="Quantity" sub={`${available} available · $${unitPrice.toFixed(2)} each`}>
              <select
                name="quantity"
                defaultValue={String(requestedQty)}
                className="w-32 h-9 px-2 rounded-md border border-border/60 bg-surface-base text-ink-primary text-[14px] font-mono tabular-nums focus-visible:outline-none focus-visible:border-gold/60"
              >
                {Array.from({ length: Math.min(10, available) }).map((_, i) => (
                  <option key={i + 1} value={i + 1}>{i + 1}</option>
                ))}
              </select>
            </FormBlock>

            {/* Shipping method */}
            {shippingOptions.length > 0 ? (
              <FormBlock label="Shipping" sub="Pick a method offered by the seller">
                <div className="space-y-2">
                  {shippingOptions.map((opt, i) => (
                    <label
                      key={opt.method}
                      className="flex items-baseline justify-between gap-3 px-3 py-2.5 border border-border/60 rounded-md bg-surface-base hover:border-gold/40 transition-colors cursor-pointer has-checked:border-gold/60 has-checked:bg-gold-dark/20"
                    >
                      <span className="flex items-baseline gap-2">
                        <input
                          type="radio"
                          name="shippingMethod"
                          value={opt.method}
                          required
                          defaultChecked={i === 0}
                          className="accent-gold"
                        />
                        <span className="text-[13px] text-ink-primary capitalize">{opt.method}</span>
                      </span>
                      <span className="font-mono text-[13px] tabular-nums text-ink-secondary">
                        ${opt.price.toFixed(2)}
                      </span>
                    </label>
                  ))}
                </div>
              </FormBlock>
            ) : (
              <FormBlock label="Shipping" sub="Seller has not listed shipping options">
                <input type="hidden" name="shippingMethod" value="standard" />
                <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink-muted">No shipping fee will be charged.</p>
              </FormBlock>
            )}

            {/* Shipping address */}
            <FormBlock label="Ship to" sub="Where you want this delivered">
              <div className="space-y-3">
                <TextField name="addr_name" placeholder="Full name" required />
                <TextField name="addr_line1" placeholder="Street address" required />
                <TextField name="addr_line2" placeholder="Apt, suite, unit (optional)" />
                <div className="grid grid-cols-2 gap-3">
                  <TextField name="addr_city" placeholder="City" required />
                  <TextField name="addr_state" placeholder="State / Region" required />
                </div>
                <div className="grid grid-cols-[1fr_auto] gap-3">
                  <TextField name="addr_zip" placeholder="ZIP / Postal code" required />
                  <TextField name="addr_country" placeholder="US" defaultValue="US" required className="w-20" />
                </div>
              </div>
            </FormBlock>
          </section>

          {/* Order summary panel */}
          <aside className="lg:sticky lg:top-20 self-start">
            <div className="border border-border/60 rounded-md bg-surface-raised p-5 space-y-4">
              <h2 className="font-display text-[18px] text-ink-primary tracking-tight" style={{ fontVariationSettings: "'opsz' 36" }}>
                Order summary
              </h2>

              <div className="flex gap-3">
                {listing.card && (
                  <CardImage
                    name={listing.card.name}
                    imageUrl={listing.card.imageUrl}
                    orbital={listing.card.orbital}
                    rarity={listing.card.rarity}
                    className="w-16 shrink-0"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-ink-primary truncate">
                    {listing.card?.name ?? "Card"}
                  </p>
                  <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-muted">
                    {listing.condition?.replace("_", " ").toLowerCase() ?? "—"}
                    {listing.treatment && <> · {listing.treatment}</>}
                  </p>
                  <p className="font-mono text-[12px] tabular-nums text-ink-secondary mt-1">
                    ${unitPrice.toFixed(2)} × {requestedQty}
                  </p>
                </div>
              </div>

              <dl className="font-mono text-[12px] space-y-1.5 pt-3 border-t border-border/40">
                <div className="flex justify-between text-ink-secondary tabular-nums">
                  <dt>Subtotal</dt><dd>${previewSubtotal.toFixed(2)}</dd>
                </div>
                <div className="flex justify-between text-ink-secondary tabular-nums">
                  <dt>Shipping (est.)</dt><dd>${initialShipping.toFixed(2)}</dd>
                </div>
                <div className="flex justify-between text-ink-primary text-[14px] tabular-nums pt-2 border-t border-border/40 mt-2">
                  <dt>Total</dt><dd>${previewTotal.toFixed(2)}</dd>
                </div>
              </dl>

              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-muted leading-relaxed pt-1">
                Sold by <span className="text-ink-secondary">{listing.seller.username}</span>.
                Total recalculates server-side from your shipping pick.
              </p>

              <button
                type="submit"
                className="w-full h-11 rounded-md bg-gold text-[#1a1208] font-medium text-[14px] uppercase tracking-[0.08em] hover:bg-gold-light transition-colors"
              >
                Place order
              </button>
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-muted text-center">
                Order opens · payment on next step
              </p>
            </div>
          </aside>
        </form>
      )}
    </div>
  );
}

function FormBlock({
  label,
  sub,
  children,
}: {
  label: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="font-display text-[18px] text-ink-primary tracking-tight" style={{ fontVariationSettings: "'opsz' 36" }}>
          {label}
        </h2>
        {sub && (
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-muted">{sub}</span>
        )}
      </div>
      {children}
    </div>
  );
}

function TextField({
  name,
  placeholder,
  required,
  defaultValue,
  className = "",
}: {
  name: string;
  placeholder: string;
  required?: boolean;
  defaultValue?: string;
  className?: string;
}) {
  return (
    <input
      type="text"
      name={name}
      placeholder={placeholder}
      defaultValue={defaultValue}
      required={required}
      className={`h-9 px-3 rounded-md border border-border/60 bg-surface-base text-ink-primary text-[13px] placeholder:text-ink-muted focus-visible:outline-none focus-visible:border-gold/60 w-full ${className}`}
    />
  );
}
