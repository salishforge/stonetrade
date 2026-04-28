import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { CardImage } from "@/components/cards/CardImage";
import { PriceStack } from "@/components/marketplace/PriceStack";

export const revalidate = 60; // dealer's counter refreshes once a minute

interface RecentSaleRow {
  id: string;
  cardId: string;
  cardName: string;
  price: string;
  createdAt: string;
  source: string;
}

export default async function HomePage() {
  // Recently-listed cards: ACTIVE listings, newest first, with their card.
  const recentListings = await prisma.listing.findMany({
    where: { status: "ACTIVE" },
    include: {
      card: {
        select: {
          id: true,
          name: true,
          cardNumber: true,
          orbital: true,
          rarity: true,
          imageUrl: true,
          marketValue: {
            select: { marketMid: true, trend7d: true, scarcityTier: true, confidence: true },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 12,
  });

  // Recent completed sales — the marketplace's tape.
  const recentSales = await prisma.$queryRaw<RecentSaleRow[]>`
    SELECT p.id, p."cardId", c.name AS "cardName", p.price::text AS price,
           p."createdAt"::text AS "createdAt", p.source::text AS source
    FROM "PriceDataPoint" p
    JOIN "Card" c ON c.id = p."cardId"
    WHERE p.source IN ('COMPLETED_SALE', 'EBAY_SOLD')
    ORDER BY p."createdAt" DESC
    LIMIT 8
  `;

  // Light stats — the room's vital signs.
  const [activeCount, gameCount, valueAgg] = await Promise.all([
    prisma.listing.count({ where: { status: "ACTIVE" } }),
    prisma.game.count(),
    prisma.cardMarketValue.aggregate({ _avg: { confidence: true } }),
  ]);
  const avgConfidence = Math.round(valueAgg._avg.confidence ?? 0);

  return (
    <div className="container mx-auto max-w-7xl px-4 pt-10 pb-20">
      {/* Masthead — small, factual, no marketing tropes. */}
      <header className="border-b border-border/40 pb-6 mb-10">
        <div className="flex items-end justify-between gap-6 flex-wrap">
          <div>
            <h1
              className="font-display text-[44px] leading-[1.05] tracking-[-0.015em] text-ink-primary"
              style={{ fontVariationSettings: "'opsz' 96" }}
            >
              The Showcase
            </h1>
            <p className="text-ink-secondary text-[14px] mt-2 max-w-xl leading-relaxed">
              Marketplace and price discovery for emerging collectible card games.
              Every price shows its confidence; every signal is on the page.
            </p>
          </div>

          {/* Stats — Bloomberg-density, mono, four datapoints. */}
          <dl className="flex items-end gap-6 font-mono text-[12px] tabular-nums">
            <div>
              <dt className="uppercase tracking-[0.1em] text-ink-muted text-[10px]">Listings</dt>
              <dd className="text-ink-primary text-[20px] leading-tight">{activeCount}</dd>
            </div>
            <div>
              <dt className="uppercase tracking-[0.1em] text-ink-muted text-[10px]">Games</dt>
              <dd className="text-ink-primary text-[20px] leading-tight">{gameCount}</dd>
            </div>
            <div>
              <dt className="uppercase tracking-[0.1em] text-ink-muted text-[10px]">Avg Conf</dt>
              <dd className="text-ink-primary text-[20px] leading-tight">{avgConfidence}%</dd>
            </div>
          </dl>
        </div>
      </header>

      <div className="grid gap-10 lg:grid-cols-[1fr_280px]">
        {/* Recently listed — the showcase itself. */}
        <section>
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="font-display text-[22px] text-ink-primary tracking-tight" style={{ fontVariationSettings: "'opsz' 36" }}>
              Recently listed
            </h2>
            <Link
              href="/browse"
              className="text-[11px] uppercase tracking-[0.12em] text-ink-secondary hover:text-gold transition-colors"
            >
              All listings →
            </Link>
          </div>

          {recentListings.length === 0 ? (
            <p className="font-mono text-[12px] uppercase tracking-[0.08em] text-ink-muted py-12 text-center">
              No active listings yet
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {recentListings.map((l) => (
                <Link
                  key={l.id}
                  href={`/listing/${l.id}`}
                  className="group block space-y-2"
                >
                  <CardImage
                    name={l.card?.name ?? "Card"}
                    imageUrl={l.card?.imageUrl ?? null}
                    orbital={l.card?.orbital ?? null}
                    rarity={l.card?.rarity}
                    className="transition-transform group-hover:scale-[1.02]"
                  />
                  <div className="space-y-1 px-0.5">
                    <p className="text-[13px] font-medium leading-tight text-ink-primary truncate">
                      {l.card?.name ?? "Card"}
                    </p>
                    <p className="font-mono text-[11px] text-ink-secondary tabular-nums">
                      ${Number(l.price).toFixed(2)} · {l.condition}
                    </p>
                    <PriceStack
                      marketMid={l.card?.marketValue?.marketMid}
                      trend7d={l.card?.marketValue?.trend7d}
                      scarcityTier={l.card?.marketValue?.scarcityTier ?? null}
                      variant="compact"
                    />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* The tape — recent sales. Reads top-to-bottom, time-ordered. */}
        <aside>
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="font-display text-[22px] text-ink-primary tracking-tight" style={{ fontVariationSettings: "'opsz' 36" }}>
              The tape
            </h2>
          </div>
          <div className="border-l border-border/60">
            {recentSales.length === 0 ? (
              <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink-muted py-3 px-4">
                No sales yet
              </p>
            ) : (
              recentSales.map((s) => (
                <div
                  key={s.id}
                  className="px-4 py-2.5 border-b border-border/40 last:border-b-0 hover:bg-surface-raised/40 transition-colors"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <Link
                      href={`/card/${s.cardId}`}
                      className="text-[13px] text-ink-primary hover:text-gold-light transition-colors truncate"
                    >
                      {s.cardName}
                    </Link>
                    <span className="font-mono text-[13px] text-ink-primary tabular-nums whitespace-nowrap">
                      ${Number(s.price).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-muted">
                      {s.source === "EBAY_SOLD" ? "ebay" : "stonetrade"}
                    </span>
                    <span className="font-mono text-[10px] tabular-nums text-ink-muted">
                      {timeAgo(new Date(s.createdAt))}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-6 text-[11px] text-ink-muted leading-relaxed">
            <p>
              The dealer&apos;s read on a card is a{" "}
              <Link href="/prices" className="text-gold hover:text-gold-light transition-colors">
                price stack
              </Link>
              , not an opinion. Every signal we have is on the page.
            </p>
          </div>
        </aside>
      </div>

      {/* Game capabilities — terse, dealer voice, no marketing copy. */}
      <section className="mt-16 pt-10 border-t border-border/40">
        <h2 className="font-display text-[22px] text-ink-primary tracking-tight mb-6" style={{ fontVariationSettings: "'opsz' 36" }}>
          On the floor
        </h2>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="border border-border/40 rounded-md p-5 bg-surface-raised/40">
            <div className="flex items-baseline justify-between mb-2">
              <h3 className="text-ink-primary font-medium text-[16px]">Wonders of The First</h3>
              <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-muted">EX1 · 401</span>
            </div>
            <p className="text-[13px] text-ink-secondary leading-relaxed mb-4">
              Existence Set. Six orbitals — Petraia, Solfera, Thalwind, Umbrathene, Heliosynth, Boundless.
              Five treatment tracks. Engine-prior pricing for thin-data cards.
            </p>
            <Link
              href="/browse?game=wotf"
              className="text-[12px] uppercase tracking-[0.12em] text-gold hover:text-gold-light transition-colors"
            >
              Browse WoTF →
            </Link>
          </div>
          <div className="border border-border/40 rounded-md p-5 bg-surface-raised/40">
            <div className="flex items-baseline justify-between mb-2">
              <h3 className="text-ink-primary font-medium text-[16px]">Bo Jackson Battle Arena</h3>
              <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-muted">ALPHA</span>
            </div>
            <p className="text-[13px] text-ink-secondary leading-relaxed mb-4">
              Alpha edition. Numbered parallels, SP heroes, Superfoil 1-of-1s, on-card autographs.
              Population data feeds the scarcity index.
            </p>
            <Link
              href="/browse?game=bjba"
              className="text-[12px] uppercase tracking-[0.12em] text-gold hover:text-gold-light transition-colors"
            >
              Browse BJBA →
            </Link>
          </div>
        </div>
      </section>
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
