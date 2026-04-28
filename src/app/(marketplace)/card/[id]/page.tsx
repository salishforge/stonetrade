import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { CardImage } from "@/components/cards/CardImage";
import { PriceStack } from "@/components/marketplace/PriceStack";

interface RecentSaleRow {
  price: string;
  source: string;
  createdAt: string;
  condition: string;
}

export default async function CardDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const card = await prisma.card.findUnique({
    where: { id },
    include: {
      game: true,
      set: true,
      marketValue: true,
      listings: {
        where: { status: "ACTIVE" },
        include: {
          seller: {
            select: { username: true, sellerRating: true, totalSales: true },
          },
        },
        orderBy: { price: "asc" },
        take: 12,
      },
    },
  });

  if (!card) notFound();

  // Treatment variants for this base card.
  const treatments = await prisma.card.findMany({
    where: { setId: card.setId, cardNumber: card.cardNumber },
    select: {
      id: true,
      treatment: true,
      isSerialized: true,
      serialTotal: true,
      marketValue: { select: { marketMid: true, confidence: true } },
    },
    orderBy: { treatment: "asc" },
  });

  // Recent sales of THIS treatment, last 30 days.
  const recentSales = await prisma.$queryRaw<RecentSaleRow[]>`
    SELECT p.price::text AS price, p.source::text AS source,
           p."createdAt"::text AS "createdAt", p.condition::text AS condition
    FROM "PriceDataPoint" p
    WHERE p."cardId" = ${card.id}
      AND p.source IN ('COMPLETED_SALE', 'EBAY_SOLD')
      AND p."createdAt" > NOW() - INTERVAL '30 days'
    ORDER BY p."createdAt" DESC
    LIMIT 8
  `;

  const lowestAsk = card.listings.length > 0 ? Number(card.listings[0].price) : null;

  return (
    <div className="container mx-auto max-w-7xl py-8 px-4">
      {/* Breadcrumb — small caps, not chrome. */}
      <nav className="mb-6 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-muted">
        <Link href="/browse" className="hover:text-gold transition-colors">Browse</Link>
        <span className="mx-2">·</span>
        <span>{card.set.code}</span>
        <span className="mx-2">·</span>
        <span>{card.cardNumber}</span>
      </nav>

      <div className="grid gap-10 lg:grid-cols-[300px_1fr_240px]">
        {/* ── Left: image + treatment selector ─────────────────────────── */}
        <aside>
          <CardImage
            name={card.name}
            imageUrl={card.imageUrl}
            orbital={card.orbital}
            rarity={card.rarity}
            className="w-full max-w-[300px]"
          />

          <div className="mt-6">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-muted mb-2">Treatment</p>
            <div className="border border-border/40 rounded-md overflow-hidden bg-surface-raised/40">
              {treatments.map((t, i) => {
                const active = t.id === card.id;
                return (
                  <Link
                    key={t.id}
                    href={`/card/${t.id}`}
                    className={`flex items-baseline justify-between px-3 py-2 text-[12px] transition-colors ${
                      active
                        ? "bg-gold-dark/30 text-gold-light"
                        : "text-ink-secondary hover:bg-surface-overlay/60 hover:text-ink-primary"
                    } ${i > 0 ? "border-t border-border/40" : ""}`}
                  >
                    <span>
                      {t.treatment}
                      {t.isSerialized && t.serialTotal && (
                        <span className="ml-1 font-mono text-[10px] text-ink-muted">/{t.serialTotal}</span>
                      )}
                    </span>
                    <span className="font-mono text-[11px] tabular-nums text-ink-muted">
                      {t.marketValue?.marketMid != null
                        ? `$${Number(t.marketValue.marketMid).toFixed(2)}`
                        : "—"}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        </aside>

        {/* ── Center: title + price stack + listings ──────────────────── */}
        <section className="min-w-0 space-y-8">
          <header>
            <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-secondary">
              {card.set.name} · {card.rarity}{card.orbital ? ` · ${card.orbital}` : ""}
            </p>
            <h1
              className="font-display text-[40px] leading-[1.05] tracking-[-0.012em] text-ink-primary mt-1"
              style={{ fontVariationSettings: "'opsz' 96" }}
            >
              {card.name}
            </h1>
            <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-muted mt-2">
              {card.cardType} · {card.treatment}
              {card.isSerialized && card.serialTotal && (
                <> · serialized /{card.serialTotal}</>
              )}
              {card.buildPoints != null && <> · DBS {card.buildPoints}</>}
            </p>
          </header>

          {/* The price stack — the loudest element on the page. */}
          <div className="border border-border/60 rounded-md p-5 bg-surface-raised">
            <div className="flex items-baseline justify-between mb-4">
              <h2 className="font-display text-[20px] text-ink-primary tracking-tight" style={{ fontVariationSettings: "'opsz' 36" }}>
                Market read
              </h2>
              {lowestAsk != null && (
                <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-muted tabular-nums">
                  Lowest ask: <span className="text-gold ml-1">${lowestAsk.toFixed(2)}</span>
                </p>
              )}
            </div>
            {card.marketValue ? (
              <PriceStack
                marketLow={card.marketValue.marketLow}
                marketMid={card.marketValue.marketMid}
                marketHigh={card.marketValue.marketHigh}
                confidence={card.marketValue.confidence}
                trend7d={card.marketValue.trend7d}
                scarcityTier={card.marketValue.scarcityTier ?? null}
                volatilityTier={card.marketValue.volatilityTier ?? null}
                variant="expanded"
              />
            ) : (
              <p className="font-mono text-[12px] uppercase tracking-[0.08em] text-ink-muted">
                No price data on this treatment yet.
                <Link href="/report-sale" className="text-gold hover:text-gold-light ml-2 normal-case tracking-normal">Report a sale →</Link>
              </p>
            )}
          </div>

          {/* Active listings — tape, not Card chrome. */}
          <div>
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="font-display text-[20px] text-ink-primary tracking-tight" style={{ fontVariationSettings: "'opsz' 36" }}>
                Active listings
              </h2>
              <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-muted">
                {card.listings.length}
              </span>
            </div>

            {card.listings.length === 0 ? (
              <p className="font-mono text-[12px] uppercase tracking-[0.08em] text-ink-muted py-4">
                No active listings for this treatment
              </p>
            ) : (
              <div className="border border-border/40 rounded-md overflow-hidden">
                <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 px-4 py-2 bg-surface-raised/60 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-muted">
                  <span>Seller</span>
                  <span>Cond</span>
                  <span>Qty</span>
                  <span className="text-right">Price</span>
                </div>
                {card.listings.map((listing) => {
                  const available = listing.quantity - listing.quantitySold;
                  return (
                    <Link
                      key={listing.id}
                      href={`/listing/${listing.id}`}
                      className="grid grid-cols-[1fr_auto_auto_auto] gap-4 px-4 py-2.5 border-t border-border/40 hover:bg-surface-raised/40 transition-colors items-baseline"
                    >
                      <div className="min-w-0">
                        <p className="text-[13px] text-ink-primary truncate">{listing.seller.username}</p>
                        {listing.seller.totalSales > 0 && (
                          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-muted">
                            {listing.seller.totalSales} sales
                            {listing.seller.sellerRating != null && (
                              <> · {Number(listing.seller.sellerRating).toFixed(1)}★</>
                            )}
                          </p>
                        )}
                      </div>
                      <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink-secondary">
                        {listing.condition?.replace("_", " ").toLowerCase() ?? "—"}
                      </span>
                      <span className="font-mono text-[12px] tabular-nums text-ink-secondary">
                        ×{available}
                      </span>
                      <span className="font-mono text-[14px] tabular-nums text-ink-primary text-right">
                        ${Number(listing.price).toFixed(2)}
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* Card text — only if we have it. Clean text block, no Card chrome. */}
          {(card.rulesText || card.flavorText) && (
            <div className="space-y-3">
              {card.rulesText && (
                <p className="text-[14px] leading-relaxed text-ink-primary">
                  {card.rulesText}
                </p>
              )}
              {card.flavorText && (
                <p className="text-[13px] italic text-ink-secondary leading-relaxed border-l-2 border-gold-dark/40 pl-4">
                  {card.flavorText}
                </p>
              )}
              {card.artist && (
                <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-muted">
                  Art · {card.artist}
                </p>
              )}
            </div>
          )}
        </section>

        {/* ── Right: recent sales tape ─────────────────────────────────── */}
        <aside>
          <h2 className="font-display text-[18px] text-ink-primary tracking-tight mb-3" style={{ fontVariationSettings: "'opsz' 36" }}>
            Recent sales
          </h2>
          <div className="border-l border-border/60">
            {recentSales.length === 0 ? (
              <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink-muted py-3 px-4">
                No recent sales (30d)
              </p>
            ) : (
              recentSales.map((s, i) => (
                <div
                  key={i}
                  className="px-4 py-2 border-b border-border/40 last:border-b-0"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-mono text-[14px] tabular-nums text-ink-primary">
                      ${Number(s.price).toFixed(2)}
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-muted">
                      {s.source === "EBAY_SOLD" ? "ebay" : "trade"}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between mt-0.5">
                    <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-muted">
                      {s.condition?.replace("_", " ").toLowerCase()}
                    </span>
                    <span className="font-mono text-[10px] tabular-nums text-ink-muted">
                      {timeAgo(new Date(s.createdAt))}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-6 pt-4 border-t border-border/40">
            <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-muted mb-2">Help the price</p>
            <div className="space-y-1.5">
              <Link href="/report-sale" className="block text-[12px] text-ink-secondary hover:text-gold transition-colors">
                · Report a sale you saw
              </Link>
              <Link href="/polls" className="block text-[12px] text-ink-secondary hover:text-gold transition-colors">
                · Vote in a price poll
              </Link>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}
