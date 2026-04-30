import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { CardImage } from "@/components/cards/CardImage";

export default async function ListingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const listing = await prisma.listing.findUnique({
    where: { id },
    include: {
      card: {
        include: {
          game: { select: { name: true, slug: true } },
          set: { select: { name: true, code: true } },
          marketValue: { select: { marketMid: true, marketLow: true, marketHigh: true, confidence: true } },
        },
      },
      seller: {
        select: { username: true, sellerRating: true, totalSales: true, country: true, memberSince: true },
      },
    },
  });

  if (!listing) notFound();

  const askPrice = Number(listing.price);
  const marketMid = listing.card?.marketValue?.marketMid != null ? Number(listing.card.marketValue.marketMid) : null;
  const deltaVsMarket = marketMid != null ? ((askPrice - marketMid) / marketMid) * 100 : null;
  const available = listing.quantity - listing.quantitySold;

  return (
    <div className="container mx-auto max-w-6xl py-8 px-4">
      {/* Breadcrumb */}
      <nav className="mb-6 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-muted">
        <Link href="/browse" className="hover:text-gold transition-colors">Browse</Link>
        {listing.card && (
          <>
            <span className="mx-2">·</span>
            <Link href={`/card/${listing.card.id}`} className="hover:text-gold transition-colors">
              {listing.card.set.code} · {listing.card.cardNumber}
            </Link>
          </>
        )}
      </nav>

      <div className="grid gap-10 lg:grid-cols-[300px_1fr]">
        {/* Left: image */}
        <aside>
          {listing.card && (
            <Link href={`/card/${listing.card.id}`}>
              <CardImage
                name={listing.card.name}
                imageUrl={listing.card.imageUrl}
                orbital={listing.card.orbital}
                rarity={listing.card.rarity}
                className="w-full max-w-[300px]"
              />
            </Link>
          )}
        </aside>

        {/* Right: listing detail */}
        <section className="space-y-8">
          <header>
            <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-secondary">
              {listing.card?.set.name}
              {listing.card?.rarity && <> · {listing.card.rarity}</>}
              {listing.card?.orbital && <> · {listing.card.orbital}</>}
            </p>
            <h1
              className="font-display text-[40px] leading-[1.05] tracking-[-0.012em] text-ink-primary mt-1"
              style={{ fontVariationSettings: "'opsz' 96" }}
            >
              {listing.card?.name ?? "Unknown card"}
            </h1>
            <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-muted mt-2">
              {listing.condition?.replace("_", " ").toLowerCase() ?? "—"}
              {listing.treatment && <> · {listing.treatment}</>}
              {listing.serialNumber && <> · #{listing.serialNumber}</>}
            </p>
          </header>

          {/* Ask price + market context — the loud thing. */}
          <div className="border border-border/60 rounded-md p-6 bg-surface-raised">
            <div className="flex items-baseline gap-6 flex-wrap">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-muted mb-1">Ask</p>
                <span className="font-mono text-[40px] tabular-nums text-ink-primary leading-none">
                  ${askPrice.toFixed(2)}
                </span>
              </div>
              {marketMid != null && (
                <div className="ml-auto text-right">
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-muted mb-1">Market mid</p>
                  <span className="font-mono text-[18px] tabular-nums text-ink-secondary">
                    ${marketMid.toFixed(2)}
                  </span>
                  {deltaVsMarket != null && (
                    <p className={`font-mono text-[12px] tabular-nums mt-0.5 ${
                      deltaVsMarket > 5
                        ? "text-crimson-light"
                        : deltaVsMarket < -5
                          ? "text-signal-legal"
                          : "text-ink-muted"
                    }`}>
                      {deltaVsMarket > 0 ? "+" : ""}{deltaVsMarket.toFixed(1)}% vs market
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-baseline justify-between mt-4 pt-4 border-t border-border/40">
              <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-muted">
                {available} of {listing.quantity} available
              </span>
              {listing.allowOffers && (
                <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-gold">
                  Offers welcome
                  {listing.minimumOffer != null && (
                    <span className="ml-1 normal-case tracking-normal text-ink-muted">
                      (min ${Number(listing.minimumOffer).toFixed(2)})
                    </span>
                  )}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 mt-5">
              {available > 0 ? (
                <Link
                  href={`/listing/${listing.id}/buy`}
                  className="h-11 rounded-md bg-gold text-[#1a1208] font-medium text-[14px] uppercase tracking-[0.08em] hover:bg-gold-light transition-colors flex items-center justify-center"
                >
                  Buy
                </Link>
              ) : (
                <button
                  type="button"
                  disabled
                  className="h-11 rounded-md border border-border/40 text-ink-muted font-medium text-[14px] uppercase tracking-[0.08em] cursor-not-allowed"
                >
                  Sold out
                </button>
              )}
              {listing.allowOffers ? (
                <button
                  type="button"
                  className="h-11 rounded-md border border-gold/60 text-gold-light font-medium text-[14px] uppercase tracking-[0.08em] hover:bg-gold-dark/30 transition-colors"
                >
                  Make offer
                </button>
              ) : (
                <button
                  type="button"
                  disabled
                  className="h-11 rounded-md border border-border/40 text-ink-muted font-medium text-[14px] uppercase tracking-[0.08em] cursor-not-allowed"
                >
                  Offers off
                </button>
              )}
            </div>
          </div>

          {/* Seller — terse, no Card chrome. */}
          <div>
            <h2 className="font-display text-[18px] text-ink-primary tracking-tight mb-3" style={{ fontVariationSettings: "'opsz' 36" }}>
              Seller
            </h2>
            <div className="border border-border/40 rounded-md p-4 bg-surface-raised/40">
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-[16px] font-medium text-ink-primary">{listing.seller.username}</span>
                {listing.seller.sellerRating != null && (
                  <span className="font-mono text-[12px] tabular-nums text-gold">
                    {Number(listing.seller.sellerRating).toFixed(1)}★
                  </span>
                )}
              </div>
              <dl className="grid grid-cols-3 gap-4 font-mono text-[11px] tabular-nums">
                <div>
                  <dt className="uppercase tracking-[0.1em] text-ink-muted text-[10px]">Sales</dt>
                  <dd className="text-ink-primary text-[14px]">{listing.seller.totalSales}</dd>
                </div>
                {listing.seller.country && (
                  <div>
                    <dt className="uppercase tracking-[0.1em] text-ink-muted text-[10px]">Ships from</dt>
                    <dd className="text-ink-primary text-[14px]">{listing.seller.country}</dd>
                  </div>
                )}
                <div>
                  <dt className="uppercase tracking-[0.1em] text-ink-muted text-[10px]">Member since</dt>
                  <dd className="text-ink-primary text-[14px]">
                    {new Date(listing.seller.memberSince).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                  </dd>
                </div>
              </dl>
            </div>
          </div>

          {/* Shipping options */}
          {Array.isArray(listing.shippingOptions) && listing.shippingOptions.length > 0 && (
            <div>
              <h2 className="font-display text-[18px] text-ink-primary tracking-tight mb-3" style={{ fontVariationSettings: "'opsz' 36" }}>
                Shipping
              </h2>
              <div className="border border-border/40 rounded-md overflow-hidden">
                {(listing.shippingOptions as Array<{ method: string; price: number }>).map((opt, i) => (
                  <div
                    key={i}
                    className={`flex items-baseline justify-between px-4 py-2.5 ${i > 0 ? "border-t border-border/40" : ""}`}
                  >
                    <span className="text-[13px] text-ink-primary">{opt.method}</span>
                    <span className="font-mono text-[13px] tabular-nums text-ink-secondary">
                      ${opt.price.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
