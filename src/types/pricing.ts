import type { PriceDataPointModel as PriceDataPoint } from "@/generated/prisma/models";

/** Weight constants for the composite market value algorithm */
export const PRICE_WEIGHTS = {
  COMPLETED_SALE: 0.40,
  BUYLIST_OFFER: 0.20,
  SELLER_LISTING: 0.15,
  COMMUNITY_POLL: 0.10,
  EBAY_SOLD: 0.10,
  MANUAL_REPORT: 0.05,
} as const;

/** Time decay half-life in days */
export const DECAY_HALF_LIFE_DAYS = 30;

/** Confidence thresholds */
export const CONFIDENCE_THRESHOLDS = {
  INSUFFICIENT: 3,   // < 3 data points
  LOW: 10,           // 3-10 data points
  MODERATE: 25,      // 10-25 data points
  // 25+ = High
} as const;

export type ConfidenceLevel = "insufficient" | "low" | "moderate" | "high";

export interface MarketValueInputs {
  completedSales: PriceDataPoint[];
  activeListings: PriceDataPoint[];
  buylistOffers: PriceDataPoint[];
  communityPolls: PriceDataPoint[];
  ebaySold: PriceDataPoint[];
  manualReports: PriceDataPoint[];
}

export interface ComputedMarketValue {
  marketLow: number | null;
  marketMid: number | null;
  marketHigh: number | null;
  confidence: number;
  confidenceLevel: ConfidenceLevel;
  totalDataPoints: number;
  sourceCounts: Record<string, number>;
}

export interface PriceTrend {
  trend7d: number | null;
  trend30d: number | null;
}
