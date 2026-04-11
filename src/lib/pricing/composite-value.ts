import { PRICE_WEIGHTS, DECAY_HALF_LIFE_DAYS, OUTLIER_STD_DEVS, MIN_DATA_POINTS } from "./constants";

interface DataPoint {
  price: number;
  source: string;
  createdAt: Date;
}

interface CompositeResult {
  marketLow: number | null;
  marketMid: number | null;
  marketHigh: number | null;
  sourceCounts: Record<string, number>;
  totalDataPoints: number;
}

/**
 * Compute time-decay weight for a data point.
 * Uses exponential decay with configurable half-life.
 */
function timeDecayWeight(createdAt: Date, now: Date): number {
  const ageMs = now.getTime() - createdAt.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  return Math.pow(0.5, ageDays / DECAY_HALF_LIFE_DAYS);
}

/**
 * Reject outliers beyond N standard deviations from the mean.
 */
function rejectOutliers(prices: number[]): number[] {
  if (prices.length < 3) return prices;

  const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
  const variance = prices.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / prices.length;
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) return prices;

  return prices.filter((p) => Math.abs(p - mean) <= OUTLIER_STD_DEVS * stdDev);
}

/**
 * Compute weighted percentile from (value, weight) pairs.
 */
function weightedPercentile(values: Array<{ value: number; weight: number }>, percentile: number): number {
  if (values.length === 0) return 0;

  // Sort by value
  const sorted = [...values].sort((a, b) => a.value - b.value);
  const totalWeight = sorted.reduce((sum, v) => sum + v.weight, 0);
  const target = totalWeight * percentile;

  let cumulative = 0;
  for (const item of sorted) {
    cumulative += item.weight;
    if (cumulative >= target) return item.value;
  }

  return sorted[sorted.length - 1].value;
}

/**
 * Core composite market value algorithm.
 *
 * Combines data from multiple sources with:
 * - Source-type weighting (sales > buylists > listings > polls > reports)
 * - Time decay (recent data weighted higher, 30-day half-life)
 * - Outlier rejection (>3 std dev from mean excluded)
 *
 * Returns null values if insufficient data.
 */
export function computeCompositeValue(dataPoints: DataPoint[]): CompositeResult {
  const now = new Date();

  // Count by source
  const sourceCounts: Record<string, number> = {};
  for (const dp of dataPoints) {
    sourceCounts[dp.source] = (sourceCounts[dp.source] ?? 0) + 1;
  }

  if (dataPoints.length < MIN_DATA_POINTS) {
    return { marketLow: null, marketMid: null, marketHigh: null, sourceCounts, totalDataPoints: dataPoints.length };
  }

  // Reject outliers on raw prices
  const allPrices = dataPoints.map((dp) => dp.price);
  const cleanPrices = rejectOutliers(allPrices);
  const cleanSet = new Set(cleanPrices);

  // Build weighted values from clean data
  const weighted: Array<{ value: number; weight: number }> = [];

  for (const dp of dataPoints) {
    if (!cleanSet.has(dp.price)) continue; // Outlier rejected

    const sourceWeight = PRICE_WEIGHTS[dp.source] ?? 0.05;
    const decayWeight = timeDecayWeight(dp.createdAt, now);
    const combinedWeight = sourceWeight * decayWeight;

    weighted.push({ value: dp.price, weight: combinedWeight });
  }

  if (weighted.length === 0) {
    return { marketLow: null, marketMid: null, marketHigh: null, sourceCounts, totalDataPoints: dataPoints.length };
  }

  const marketLow = weightedPercentile(weighted, 0.25);
  const marketMid = weightedPercentile(weighted, 0.50);
  const marketHigh = weightedPercentile(weighted, 0.75);

  return {
    marketLow: Math.round(marketLow * 100) / 100,
    marketMid: Math.round(marketMid * 100) / 100,
    marketHigh: Math.round(marketHigh * 100) / 100,
    sourceCounts,
    totalDataPoints: dataPoints.length,
  };
}
