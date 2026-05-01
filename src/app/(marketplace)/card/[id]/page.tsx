import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { CardImage } from "@/components/cards/CardImage";
import { PriceStack } from "@/components/marketplace/PriceStack";
import { AttributionPanel } from "@/components/marketplace/AttributionPanel";
import { WatchToggle } from "@/components/marketplace/WatchToggle";
import { loadCardAttribution } from "@/lib/attribution/load";

interface RecentSaleRow {
  price: string;
  source: string;
  createdAt: string;
  condition: string;
}

interface EbayListingRow {
  price: string;
  condition: string;
  url: string;
  createdAt: string;
}

/**
 * eBay listings ingested within this window are still likely to be live.
 * Listings older than this are skipped from the deep-link panel — many
 * will have ended. The price-history side of the pricing engine still
 * uses the older rows; this filter applies only to the outbound-link UI.
 */
const EBAY_LISTING_FRESHNESS_DAYS = 14;

/**
 * Server action: add a buylist entry (or bounty) for the current card.
 * Auto-creates a default Buylist for the user if they don't have one yet —
 * most users will only ever maintain a single list, so making them name it
 * upfront is friction. Power users can create more from /buylist later.
 *
 * Same row whether it's a normal want or a bounty: the isBounty flag controls
 * whether it shows up on the home page Showcase. Re-adding the same card with
 * isBounty=true upgrades the entry; re-adding with isBounty=false leaves
 * any existing bounty flag alone (the unique constraint on
 * (buylistId, cardId, treatment, condition) means it's an upsert).
 */
async function addToBuylist(formData: FormData) {
  "use server";

  const user = await requireUser();
  const cardId = formData.get("cardId");
  const maxPriceRaw = formData.get("maxPrice");
  const isBounty = formData.get("isBounty") === "true";
  const autoBuy = formData.get("autoBuy") === "true";
  const treatment = formData.get("treatment");
  const condition = formData.get("condition");

  if (typeof cardId !== "string") throw new Error("Missing cardId");
  if (typeof treatment !== "string" || !treatment) throw new Error("Missing treatment");
  if (typeof condition !== "string" || !condition) throw new Error("Missing condition");
  const maxPrice = Number(maxPriceRaw);
  if (!Number.isFinite(maxPrice) || maxPrice <= 0) throw new Error("Invalid max price");

  // Default buylist on demand. Stays the user's "main" list for everything
  // they add via this affordance.
  let buylist = await prisma.buylist.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });
  if (!buylist) {
    buylist = await prisma.buylist.create({
      data: { userId: user.id, name: "Want list", isPublic: false },
    });
  }

  const cardConditionEnum = condition as
    | "MINT" | "NEAR_MINT" | "LIGHTLY_PLAYED" | "MODERATELY_PLAYED" | "HEAVILY_PLAYED" | "DAMAGED";

  await prisma.buylistEntry.upsert({
    where: {
      buylistId_cardId_treatment_condition: {
        buylistId: buylist.id,
        cardId,
        treatment,
        condition: cardConditionEnum,
      },
    },
    create: {
      buylistId: buylist.id,
      cardId,
      treatment,
      condition: cardConditionEnum,
      maxPrice,
      quantity: 1,
      isBounty,
      bountyPostedAt: isBounty ? new Date() : null,
      autoBuy: isBounty ? autoBuy : false, // autoBuy only meaningful on a bounty
    },
    update: {
      maxPrice,
      // Promoting a want to a bounty stamps a fresh bountyPostedAt; demoting
      // clears it but leaves the entry. autoBuy mirrors isBounty.
      isBounty,
      bountyPostedAt: isBounty ? new Date() : null,
      autoBuy: isBounty ? autoBuy : false,
    },
  });

  revalidatePath(`/card/${cardId}`);
  revalidatePath("/");
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
      engineMetrics: true,
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

  // Existing buylist entry for this user on this exact card+treatment.
  // Used to pre-fill the "add to buylist" form so the affordance reads
  // "edit my want" rather than "add" when one already exists.
  const currentUser = await requireUser();
  const existingEntry = await prisma.buylistEntry.findFirst({
    where: {
      cardId: card.id,
      treatment: card.treatment,
      buylist: { userId: currentUser.id },
    },
    orderBy: { isBounty: "desc" }, // prefer the bounty row if user has both NM + LP
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

  // Active eBay listings — outbound deep-links so members can find supply
  // matching their price. Cheapest first. Skips rows ingested before this
  // feature shipped (ebayItemUrl IS NULL) and rows older than the freshness
  // window (likely ended).
  const ebayListings = await prisma.$queryRaw<EbayListingRow[]>`
    SELECT p.price::text AS price, p.condition::text AS condition,
           p."ebayItemUrl" AS url, p."createdAt"::text AS "createdAt"
    FROM "PriceDataPoint" p
    WHERE p."cardId" = ${card.id}
      AND p.source = 'EBAY_LISTED'
      AND p."ebayItemUrl" IS NOT NULL
      AND p."createdAt" > NOW() - (${EBAY_LISTING_FRESHNESS_DAYS}::int * INTERVAL '1 day')
    ORDER BY p.price ASC
    LIMIT 6
  `;

  const lowestAsk = card.listings.length > 0 ? Number(card.listings[0].price) : null;

  // Attribution + alert state. Both are scoped to this exact card+treatment
  // — the same row the marketValue panel above is reading from.
  const [attribution, existingAlerts] = await Promise.all([
    card.marketValue
      ? loadCardAttribution({
          cardId: card.id,
          trend7d: card.marketValue.trend7d != null ? Number(card.marketValue.trend7d) : null,
          scarcityTier: card.marketValue.scarcityTier ?? null,
          totalAvailable: card.marketValue.totalAvailable,
          totalWanted: card.marketValue.totalWanted,
          priCurrent: card.engineMetrics?.pri ?? null,
        })
      : null,
    prisma.userAlert.findMany({
      where: { userId: currentUser.id, cardId: card.id, active: true },
      select: { id: true, type: true, thresholdPct: true },
    }),
  ]);

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

            {attribution && (
              <div className="mt-5 pt-5 border-t border-border/40">
                <AttributionPanel attribution={attribution} />
              </div>
            )}
          </div>

          {/* Engine read — deck-inclusion + win-rate + PRI from the platform. */}
          <div className="border border-border/60 rounded-md p-5 bg-surface-raised">
            <div className="flex items-baseline justify-between mb-4">
              <h2 className="font-display text-[20px] text-ink-primary tracking-tight" style={{ fontVariationSettings: "'opsz' 36" }}>
                Engine read
              </h2>
              <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-muted">
                Source: <span className="text-ink-secondary">wonders-platform</span>
              </p>
            </div>
            {card.engineMetrics && card.engineMetrics.pri != null ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3 font-mono text-[12px]">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.1em] text-ink-muted mb-0.5">PRI</div>
                  <div className="text-ink-primary text-[18px] tabular-nums">
                    {card.engineMetrics.pri}
                    <span className="text-ink-muted text-[12px] ml-1">/ 100</span>
                  </div>
                  {card.engineMetrics.priConfidence != null && (
                    <div className="text-[10px] tabular-nums text-ink-muted mt-0.5">
                      conf {card.engineMetrics.priConfidence}%
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.1em] text-ink-muted mb-0.5">Inclusion</div>
                  <div className="text-ink-primary text-[18px] tabular-nums">
                    {card.engineMetrics.deckInclusionPct != null
                      ? `${Number(card.engineMetrics.deckInclusionPct).toFixed(1)}%`
                      : "—"}
                  </div>
                  <div className="text-[10px] text-ink-muted">across all formats</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.1em] text-ink-muted mb-0.5">DBS</div>
                  <div className="text-ink-primary text-[18px] tabular-nums">
                    {card.engineMetrics.dbsScore ?? "—"}
                  </div>
                  <div className="text-[10px] text-ink-muted">deckbuilding score</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.1em] text-ink-muted mb-0.5">Avg copies</div>
                  <div className="text-ink-primary text-[18px] tabular-nums">
                    {card.engineMetrics.avgCopiesPlayed != null
                      ? Number(card.engineMetrics.avgCopiesPlayed).toFixed(2)
                      : "—"}
                  </div>
                  <div className="text-[10px] text-ink-muted">per deck included</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.1em] text-ink-muted mb-0.5">Win rate</div>
                  <div className="text-ink-primary text-[18px] tabular-nums">
                    {card.engineMetrics.winRateWhenIncluded != null
                      ? `${Number(card.engineMetrics.winRateWhenIncluded).toFixed(1)}%`
                      : "—"}
                  </div>
                  <div className="text-[10px] text-ink-muted">
                    {card.engineMetrics.winRateWhenIncluded != null ? "when included" : "no games yet"}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.1em] text-ink-muted mb-0.5">Replacement</div>
                  <div className="text-ink-primary text-[18px] tabular-nums">
                    {card.engineMetrics.replacementRate != null
                      ? `${Number(card.engineMetrics.replacementRate).toFixed(1)}%`
                      : "—"}
                  </div>
                  <div className="text-[10px] text-ink-muted">
                    {card.engineMetrics.replacementRate != null ? "when removed" : "engine pending"}
                  </div>
                </div>
              </div>
            ) : (
              <p className="font-mono text-[12px] uppercase tracking-[0.08em] text-ink-muted">
                No deck data for this card yet.
                <span className="ml-2 normal-case tracking-normal text-ink-secondary">
                  Cards become measurable once they appear in registered decks.
                </span>
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

          {/* Outbound eBay deep-links — supply we don't host, surfaced so the
              member can find a card that fits their budget without leaving
              empty-handed when our marketplace doesn't have it. Cheapest
              first; opens in a new tab; clearly labelled as off-site. */}
          {ebayListings.length > 0 && (
            <div>
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="font-display text-[20px] text-ink-primary tracking-tight" style={{ fontVariationSettings: "'opsz' 36" }}>
                  Also on eBay
                </h2>
                <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-muted">
                  off-site · last {EBAY_LISTING_FRESHNESS_DAYS}d
                </span>
              </div>

              <div className="border border-border/40 rounded-md overflow-hidden">
                <div className="grid grid-cols-[1fr_auto_auto] gap-4 px-4 py-2 bg-surface-raised/60 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-muted">
                  <span>Listing</span>
                  <span>Cond</span>
                  <span className="text-right">Price</span>
                </div>
                {ebayListings.map((l, i) => (
                  <a
                    key={i}
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="grid grid-cols-[1fr_auto_auto] gap-4 px-4 py-2.5 border-t border-border/40 hover:bg-surface-raised/40 transition-colors items-baseline"
                  >
                    <span className="text-[13px] text-ink-secondary truncate">
                      View on eBay <span aria-hidden>↗</span>
                    </span>
                    <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink-secondary">
                      {l.condition?.replace("_", " ").toLowerCase() ?? "—"}
                    </span>
                    <span className="font-mono text-[14px] tabular-nums text-ink-primary text-right">
                      ${Number(l.price).toFixed(2)}
                    </span>
                  </a>
                ))}
              </div>
            </div>
          )}

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

          {/* Watch / alert subscription — quiet, four-row toggle list. */}
          <div className="mt-6 pt-4 border-t border-border/40">
            <WatchToggle
              cardId={card.id}
              existing={existingAlerts.map((a) => ({
                id: a.id,
                type: a.type,
                thresholdPct: a.thresholdPct != null ? a.thresholdPct.toString() : null,
              }))}
            />
          </div>

          {/* Want / Bounty — same form, isBounty toggle promotes to home page. */}
          <div className="mt-6 pt-4 border-t border-border/40">
            <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-muted mb-2">
              {existingEntry?.isBounty ? "Your bounty" : existingEntry ? "On your want list" : "Want this card?"}
            </p>
            <form action={addToBuylist} className="space-y-2">
              <input type="hidden" name="cardId" value={card.id} />
              <input type="hidden" name="treatment" value={card.treatment} />
              <input type="hidden" name="condition" value="NEAR_MINT" />

              <label className="flex items-baseline justify-between gap-2 text-[11px]">
                <span className="font-mono uppercase tracking-[0.1em] text-ink-muted">Max pay</span>
                <span className="flex items-baseline gap-1">
                  <span className="font-mono text-ink-muted">$</span>
                  <input
                    type="number"
                    name="maxPrice"
                    step="0.01"
                    min="0.01"
                    required
                    defaultValue={existingEntry ? Number(existingEntry.maxPrice).toFixed(2) : ""}
                    placeholder="0.00"
                    className="w-20 h-7 px-2 rounded border border-border/60 bg-surface-base text-ink-primary text-[12px] font-mono tabular-nums text-right focus-visible:outline-none focus-visible:border-gold/60"
                  />
                </span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  name="isBounty"
                  value="true"
                  defaultChecked={existingEntry?.isBounty ?? false}
                  className="accent-gold"
                />
                <span className="text-[12px] text-ink-primary">Post as bounty</span>
                <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-muted">(public)</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer pl-5">
                <input
                  type="checkbox"
                  name="autoBuy"
                  value="true"
                  defaultChecked={existingEntry?.autoBuy ?? false}
                  className="accent-gold"
                />
                <span className="text-[12px] text-ink-primary">Auto-buy on match</span>
              </label>

              <button
                type="submit"
                className="w-full py-2 rounded border border-gold/60 bg-gold-dark/30 text-[10px] uppercase tracking-[0.12em] text-gold-light hover:bg-gold-dark/50 transition-colors"
              >
                {existingEntry ? "Update" : "Add"}
              </button>
            </form>
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
