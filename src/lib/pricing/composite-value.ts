import Decimal from "decimal.js";
import {
  PRICE_WEIGHTS,
  DECAY_HALF_LIFE_DAYS,
  OUTLIER_STD_DEVS,
  MIN_DATA_POINTS,
  MIN_DATA_POINTS_FOR_TRANSACTIONAL,
} from "./constants";

interface DataPoint {
  price: Decimal;
  source: string;
  createdAt: Date;
}

interface CompositeResult {
  marketLow: Decimal | null;
  marketMid: Decimal | null;
  marketHigh: Decimal | null;
  sourceCounts: Record<string, number>;
  totalDataPoints: number;
}

export interface EnginePriorOptions {
  /** PRI 0–100 from CardEngineMetrics; used only when transactional data is sparse. */
  pri?: number;
  /** PRI confidence 0–100. */
  priConfidence?: number;
  /**
   * Caller-supplied prior price (e.g. median of comparable cards). When provided
   * with `pri`, the engine-prior fallback uses this as marketMid and produces
   * marketLow/marketHigh as ±15% around it.
   */
  engineEstimate?: Decimal;
}

/**
 * Compute time-decay weight for a data point.
 * Uses exponential decay with configurable half-life.
 */
function timeDecayWeight(createdAt: Date, now: Date): Decimal {
  const ageMs = now.getTime() - createdAt.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  return new Decimal(0.5).pow(ageDays / DECAY_HALF_LIFE_DAYS);
}

/**
 * Reject outliers beyond N standard deviations from the mean.
 */
function rejectOutliers(prices: Decimal[]): Decimal[] {
  if (prices.length < 3) return prices;

  const mean = prices.reduce((a, b) => a.plus(b), new Decimal(0)).div(prices.length);
  const variance = prices.reduce((sum, p) => sum.plus(p.minus(mean).pow(2)), new Decimal(0)).div(prices.length);
  const stdDev = variance.sqrt();

  if (stdDev.isZero()) return prices;

  const threshold = stdDev.times(OUTLIER_STD_DEVS);
  return prices.filter((p) => p.minus(mean).abs().lte(threshold));
}

/**
 * Compute weighted percentile from (value, weight) pairs.
 */
function weightedPercentile(values: Array<{ value: Decimal; weight: Decimal }>, percentile: number): Decimal {
  if (values.length === 0) return new Decimal(0);

  // Sort by value
  const sorted = [...values].sort((a, b) => a.value.cmp(b.value));
  const totalWeight = sorted.reduce((sum, v) => sum.plus(v.weight), new Decimal(0));
  const target = totalWeight.times(percentile);

  let cumulative = new Decimal(0);
  for (const item of sorted) {
    cumulative = cumulative.plus(item.weight);
    if (cumulative.gte(target)) return item.value;
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
export function computeCompositeValue(
  dataPoints: DataPoint[],
  options?: EnginePriorOptions,
): CompositeResult {
  const now = new Date();

  // Count by source
  const sourceCounts: Record<string, number> = {};
  for (const dp of dataPoints) {
    sourceCounts[dp.source] = (sourceCounts[dp.source] ?? 0) + 1;
  }

  if (dataPoints.length < MIN_DATA_POINTS) {
    return { marketLow: null, marketMid: null, marketHigh: null, sourceCounts, totalDataPoints: dataPoints.length };
  }

  // Sparse transactional data → degrade to engine-prior estimate when caller provided one.
  if (
    dataPoints.length < MIN_DATA_POINTS_FOR_TRANSACTIONAL &&
    options?.engineEstimate !== undefined &&
    options.pri !== undefined
  ) {
    const mid = options.engineEstimate;
    return {
      marketLow: mid.times(0.85).toDecimalPlaces(2),
      marketMid: mid.toDecimalPlaces(2),
      marketHigh: mid.times(1.15).toDecimalPlaces(2),
      sourceCounts,
      totalDataPoints: dataPoints.length,
    };
  }

  // Reject outliers on raw prices
  const allPrices = dataPoints.map((dp) => dp.price);
  const cleanPrices = rejectOutliers(allPrices);

  // Build weighted values from clean data
  const weighted: Array<{ value: Decimal; weight: Decimal }> = [];

  for (const dp of dataPoints) {
    if (!cleanPrices.some(p => p.eq(dp.price))) continue; // Outlier rejected

    const sourceWeight = new Decimal(PRICE_WEIGHTS[dp.source] ?? 0.05);
    const decayWeight = timeDecayWeight(dp.createdAt, now);
    const combinedWeight = sourceWeight.times(decayWeight);

    weighted.push({ value: dp.price, weight: combinedWeight });
  }

  if (weighted.length === 0) {
    return { marketLow: null, marketMid: null, marketHigh: null, sourceCounts, totalDataPoints: dataPoints.length };
  }

  const marketLow = weightedPercentile(weighted, 0.25);
  const marketMid = weightedPercentile(weighted, 0.50);
  const marketHigh = weightedPercentile(weighted, 0.75);

  return {
    marketLow: marketLow.toDecimalPlaces(2),
    marketMid: marketMid.toDecimalPlaces(2),
    marketHigh: marketHigh.toDecimalPlaces(2),
    sourceCounts,
    totalDataPoints: dataPoints.length,
  };
}
