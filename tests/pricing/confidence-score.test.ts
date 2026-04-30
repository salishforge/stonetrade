import { describe, it, expect } from "vitest";
import { computeConfidence } from "@/lib/pricing/confidence-score";

describe("computeConfidence", () => {
  it("returns 0 when no data points", () => {
    expect(computeConfidence({ totalDataPoints: 0, sourceCounts: {}, mostRecentDate: null, priceVariance: 0 })).toBe(0);
  });

  it("stays within 0..100 for high-volume diverse input", () => {
    const score = computeConfidence({
      totalDataPoints: 1000,
      sourceCounts: { COMPLETED_SALE: 200, EBAY_SOLD: 200, BUYLIST_OFFER: 200, SELLER_LISTING: 200, COMMUNITY_POLL: 200 },
      mostRecentDate: new Date(),
      priceVariance: 0,
    });
    expect(score).toBeGreaterThanOrEqual(80);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("score is monotonic in totalDataPoints", () => {
    const base = { sourceCounts: { COMPLETED_SALE: 1 }, mostRecentDate: new Date(), priceVariance: 0 };
    const low = computeConfidence({ ...base, totalDataPoints: 5 });
    const high = computeConfidence({ ...base, totalDataPoints: 50 });
    expect(high).toBeGreaterThan(low);
  });

  it("diversity score caps at 20 (4 sources × 5)", () => {
    const four = computeConfidence({
      totalDataPoints: 100,
      sourceCounts: { A: 25, B: 25, C: 25, D: 25 },
      mostRecentDate: new Date(),
      priceVariance: 0,
    });
    const six = computeConfidence({
      totalDataPoints: 100,
      sourceCounts: { A: 17, B: 17, C: 17, D: 17, E: 16, F: 16 },
      mostRecentDate: new Date(),
      priceVariance: 0,
    });
    expect(six - four).toBeLessThanOrEqual(5);
  });

  it("recent data scores higher than old data", () => {
    const recent = computeConfidence({
      totalDataPoints: 10,
      sourceCounts: { COMPLETED_SALE: 10 },
      mostRecentDate: new Date(),
      priceVariance: 0,
    });
    const old = computeConfidence({
      totalDataPoints: 10,
      sourceCounts: { COMPLETED_SALE: 10 },
      mostRecentDate: new Date(Date.now() - 100 * 86400000),
      priceVariance: 0,
    });
    expect(recent).toBeGreaterThan(old);
  });
});
