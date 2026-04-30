import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { computeCompositeValue, type EnginePriorOptions } from "./composite-value";
import { computeConfidence } from "./confidence-score";
import {
  ENGINE_PRIOR_PRI_BAND,
  ENGINE_PRIOR_MIN_COMPARABLES,
  VOLATILITY_TIERS,
  VOLATILITY_MIN_POINTS,
  SCARCITY_TIERS,
} from "./constants";

function classifyVolatility(coeffVar: Decimal): string {
  const cv = coeffVar.toNumber();
  if (cv <= VOLATILITY_TIERS.STABLE) return "stable";
  if (cv <= VOLATILITY_TIERS.MODERATE) return "moderate";
  if (cv <= VOLATILITY_TIERS.VOLATILE) return "volatile";
  return "extreme";
}

function classifyScarcity(ratio: Decimal): string {
  const r = ratio.toNumber();
  if (r < SCARCITY_TIERS.ABUNDANT) return "abundant";
  if (r < SCARCITY_TIERS.AVAILABLE) return "available";
  if (r < SCARCITY_TIERS.SCARCE) return "scarce";
  return "acute";
}

async function getEngineEstimate(
  card: { id: string; rarity: string; treatment: string },
  pri: number,
): Promise<Decimal | null> {
  const candidates = await prisma.cardEngineMetrics.findMany({
    where: {
      pri: { gte: pri - ENGINE_PRIOR_PRI_BAND, lte: pri + ENGINE_PRIOR_PRI_BAND },
      cardId: { not: card.id },
    },
    include: { card: { select: { rarity: true, treatment: true, marketValue: true } } },
    take: 200,
  });

  const prices: Decimal[] = [];
  for (const c of candidates) {
    if (c.card.rarity !== card.rarity) continue;
    if (c.card.treatment !== card.treatment) continue;
    const mid = c.card.marketValue?.marketMid;
    if (mid == null) continue;
    prices.push(new Decimal(mid.toString()));
  }

  if (prices.length < ENGINE_PRIOR_MIN_COMPARABLES) return null;

  prices.sort((a, b) => a.cmp(b));
  const mid = prices.length / 2;
  if (prices.length % 2 === 1) {
    return prices[Math.floor(mid)];
  }
  return prices[mid - 1].plus(prices[mid]).div(2);
}

/**
 * Recalculate the CardMarketValue for a single card.
 */
export async function recalculateCardValue(cardId: string) {
  const dataPoints = await prisma.priceDataPoint.findMany({
    where: { cardId },
    orderBy: { createdAt: "desc" },
  });

  if (dataPoints.length === 0) {
    // Remove stale market value if no data
    await prisma.cardMarketValue.deleteMany({ where: { cardId } });
    return null;
  }

  const points = dataPoints.map((dp) => ({
    price: dp.price,
    source: dp.source,
    createdAt: dp.createdAt,
  }));

  const card = await prisma.card.findUnique({
    where: { id: cardId },
    select: { id: true, rarity: true, treatment: true },
  });
  const engineMetrics = await prisma.cardEngineMetrics.findUnique({ where: { cardId } });

  let priorOptions: EnginePriorOptions | undefined;
  if (card && engineMetrics?.pri != null) {
    const engineEstimate = await getEngineEstimate(card, engineMetrics.pri);
    if (engineEstimate) {
      priorOptions = {
        pri: engineMetrics.pri,
        priConfidence: engineMetrics.priConfidence ?? undefined,
        engineEstimate,
      };
    }
  }

  const result = computeCompositeValue(points, priorOptions);

  // Compute price variance (coefficient of variation)
  const prices = points.map((p) => p.price);
  const mean = prices.reduce((a, b) => a.plus(b), new Decimal(0)).div(prices.length);
  const variance = prices.reduce((sum, p) => sum.plus(p.minus(mean).pow(2)), new Decimal(0)).div(prices.length);
  const stdDev = variance.sqrt();
  const cv = mean.gt(0) ? stdDev.div(mean) : new Decimal(0);

  const confidence = computeConfidence({
    totalDataPoints: result.totalDataPoints,
    sourceCounts: result.sourceCounts,
    mostRecentDate: dataPoints[0]?.createdAt ?? null,
    priceVariance: cv.toNumber(),
  });

  // Compute trends
  const now = new Date();
  const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const recentPoints = points.filter((p) => p.createdAt >= d7);
  const olderPoints = points.filter((p) => p.createdAt < d7 && p.createdAt >= d30);

  let trend7d: Decimal | null = null;
  let trend30d: Decimal | null = null;

  if (recentPoints.length > 0 && olderPoints.length > 0) {
    const recentAvg = recentPoints.reduce((s, p) => s.plus(p.price), new Decimal(0)).div(recentPoints.length);
    const olderAvg = olderPoints.reduce((s, p) => s.plus(p.price), new Decimal(0)).div(olderPoints.length);
    if (olderAvg.gt(0)) {
      trend7d = recentAvg.minus(olderAvg).div(olderAvg).times(100).toDecimalPlaces(2);
    }
  }

  const d30Points = points.filter((p) => p.createdAt < d30);
  if (points.length > 0 && d30Points.length > 0) {
    const currentAvg = points.slice(0, Math.min(5, points.length)).reduce((s, p) => s.plus(p.price), new Decimal(0)).div(Math.min(5, points.length));
    const oldAvg = d30Points.reduce((s, p) => s.plus(p.price), new Decimal(0)).div(d30Points.length);
    if (oldAvg.gt(0)) {
      trend30d = currentAvg.minus(oldAvg).div(oldAvg).times(100).toDecimalPlaces(2);
    }
  }

  // Volatility — restricted to the last 30 days. Tier is null when there
  // aren't enough points to be statistically meaningful.
  const points30d = points.filter((p) => p.createdAt >= d30);
  let stdDev30d: Decimal | null = null;
  let coeffVar30d: Decimal | null = null;
  let volatilityTier: string | null = null;
  if (points30d.length >= VOLATILITY_MIN_POINTS) {
    const prices30d = points30d.map((p) => p.price);
    const mean30 = prices30d.reduce((a, b) => a.plus(b), new Decimal(0)).div(prices30d.length);
    const variance30 = prices30d
      .reduce((sum, p) => sum.plus(p.minus(mean30).pow(2)), new Decimal(0))
      .div(prices30d.length);
    stdDev30d = variance30.sqrt().toDecimalPlaces(2);
    if (mean30.gt(0)) {
      coeffVar30d = stdDev30d.div(mean30).toDecimalPlaces(4);
      volatilityTier = classifyVolatility(coeffVar30d);
    }
  }

  // Scarcity — snapshot of supply vs demand for this card. Counts span all
  // treatments because buylists and collections are typically demand for the
  // card identity, not a specific treatment. Active listings only.
  const [wantedAgg, availableAgg, collectedAgg] = await Promise.all([
    prisma.buylistEntry.aggregate({
      where: { cardId },
      _sum: { quantity: true },
    }),
    prisma.listing.aggregate({
      where: { cardId, status: "ACTIVE" },
      _sum: { quantity: true, quantitySold: true },
    }),
    prisma.collectionCard.aggregate({
      where: { cardId },
      _sum: { quantity: true },
    }),
  ]);
  const totalWanted = wantedAgg._sum.quantity ?? 0;
  const listingTotal = availableAgg._sum.quantity ?? 0;
  const listingSold = availableAgg._sum.quantitySold ?? 0;
  const totalAvailable = Math.max(0, listingTotal - listingSold);
  const totalCollected = collectedAgg._sum.quantity ?? 0;

  // Ratio = wanted / max(available, 1). When wanted is 0 there's no demand
  // signal; we still emit a 0 ratio so callers can render "abundant" tier
  // rather than a missing value.
  const scarcityRatio = new Decimal(totalWanted)
    .div(Math.max(totalAvailable, 1))
    .toDecimalPlaces(4);
  const scarcityTier = classifyScarcity(scarcityRatio);

  // Source counts
  const sc = result.sourceCounts;

  const value = await prisma.cardMarketValue.upsert({
    where: { cardId },
    update: {
      marketLow: result.marketLow,
      marketMid: result.marketMid,
      marketHigh: result.marketHigh,
      confidence,
      totalSales: (sc.COMPLETED_SALE ?? 0) + (sc.EBAY_SOLD ?? 0),
      totalListings: sc.SELLER_LISTING ?? 0,
      totalBuylist: sc.BUYLIST_OFFER ?? 0,
      totalPollVotes: sc.COMMUNITY_POLL ?? 0,
      trend7d,
      trend30d,
      stdDev30d,
      coeffVar30d,
      volatilityTier,
      totalWanted,
      totalAvailable,
      totalCollected,
      scarcityRatio,
      scarcityTier,
      lastUpdated: new Date(),
    },
    create: {
      cardId,
      marketLow: result.marketLow,
      marketMid: result.marketMid,
      marketHigh: result.marketHigh,
      confidence,
      totalSales: (sc.COMPLETED_SALE ?? 0) + (sc.EBAY_SOLD ?? 0),
      totalListings: sc.SELLER_LISTING ?? 0,
      totalBuylist: sc.BUYLIST_OFFER ?? 0,
      totalPollVotes: sc.COMMUNITY_POLL ?? 0,
      trend7d,
      trend30d,
      stdDev30d,
      coeffVar30d,
      volatilityTier,
      totalWanted,
      totalAvailable,
      totalCollected,
      scarcityRatio,
      scarcityTier,
    },
  });

  return value;
}

/**
 * Recalculate market values for all cards that have price data.
 */
export async function recalculateAllCardValues() {
  const cardIds = await prisma.priceDataPoint.findMany({
    select: { cardId: true },
    distinct: ["cardId"],
  });

  let updated = 0;
  for (const { cardId } of cardIds) {
    await recalculateCardValue(cardId);
    updated++;
  }

  return { updated };
}
