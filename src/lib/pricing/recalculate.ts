import { prisma } from "@/lib/prisma";
import { computeCompositeValue } from "./composite-value";
import { computeConfidence } from "./confidence-score";

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
    price: Number(dp.price),
    source: dp.source,
    createdAt: dp.createdAt,
  }));

  const result = computeCompositeValue(points);

  // Compute price variance (coefficient of variation)
  const prices = points.map((p) => p.price);
  const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
  const variance = prices.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / prices.length;
  const stdDev = Math.sqrt(variance);
  const cv = mean > 0 ? stdDev / mean : 0;

  const confidence = computeConfidence({
    totalDataPoints: result.totalDataPoints,
    sourceCounts: result.sourceCounts,
    mostRecentDate: dataPoints[0]?.createdAt ?? null,
    priceVariance: cv,
  });

  // Compute trends
  const now = new Date();
  const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const recentPoints = points.filter((p) => p.createdAt >= d7);
  const olderPoints = points.filter((p) => p.createdAt < d7 && p.createdAt >= d30);

  let trend7d: number | null = null;
  let trend30d: number | null = null;

  if (recentPoints.length > 0 && olderPoints.length > 0) {
    const recentAvg = recentPoints.reduce((s, p) => s + p.price, 0) / recentPoints.length;
    const olderAvg = olderPoints.reduce((s, p) => s + p.price, 0) / olderPoints.length;
    if (olderAvg > 0) {
      trend7d = Math.round(((recentAvg - olderAvg) / olderAvg) * 10000) / 100;
    }
  }

  const d30Points = points.filter((p) => p.createdAt < d30);
  if (points.length > 0 && d30Points.length > 0) {
    const currentAvg = points.slice(0, Math.min(5, points.length)).reduce((s, p) => s + p.price, 0) / Math.min(5, points.length);
    const oldAvg = d30Points.reduce((s, p) => s + p.price, 0) / d30Points.length;
    if (oldAvg > 0) {
      trend30d = Math.round(((currentAvg - oldAvg) / oldAvg) * 10000) / 100;
    }
  }

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
