import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { computeCompositeValue } from "@/lib/pricing/composite-value";

describe("computeCompositeValue", () => {
  function mkPoint(price: number, source: string, ageDays = 0) {
    return {
      price: new Decimal(price),
      source,
      createdAt: new Date(Date.now() - ageDays * 86400000),
    };
  }

  it("returns all nulls for empty input", () => {
    const r = computeCompositeValue([]);
    expect(r.marketLow).toBeNull();
    expect(r.marketMid).toBeNull();
    expect(r.marketHigh).toBeNull();
    expect(r.totalDataPoints).toBe(0);
  });

  it("returns marketMid equal to single data point's price (MIN_DATA_POINTS=1)", () => {
    const r = computeCompositeValue([mkPoint(10, "COMPLETED_SALE")]);
    expect(r.marketMid!.toString()).toBe(new Decimal("10").toDecimalPlaces(2).toString());
  });

  it("rejects extreme outlier price", () => {
    const points = [
      mkPoint(10, "COMPLETED_SALE"), mkPoint(10, "COMPLETED_SALE"), mkPoint(10, "COMPLETED_SALE"),
      mkPoint(10, "COMPLETED_SALE"), mkPoint(10, "COMPLETED_SALE"), mkPoint(10, "COMPLETED_SALE"),
      mkPoint(10, "COMPLETED_SALE"), mkPoint(10, "COMPLETED_SALE"), mkPoint(10, "COMPLETED_SALE"),
      mkPoint(1000, "COMPLETED_SALE"),
    ];
    const r = computeCompositeValue(points);
    expect(r.marketMid!.lte(new Decimal(15))).toBe(true);
  });

  it("counts data points by source", () => {
    const points = [
      mkPoint(10, "COMPLETED_SALE"), mkPoint(11, "COMPLETED_SALE"),
      mkPoint(12, "COMPLETED_SALE"), mkPoint(13, "COMPLETED_SALE"),
      mkPoint(14, "COMPLETED_SALE"),
    ];
    const r = computeCompositeValue(points);
    expect(r.sourceCounts.COMPLETED_SALE).toBe(5);
  });

  it("uses engine prior when transactional data is sparse", () => {
    const r = computeCompositeValue(
      [mkPoint(10, "COMPLETED_SALE")],
      { pri: 50, priConfidence: 70, engineEstimate: new Decimal("20") },
    );
    expect(r.marketMid!.toString()).toBe("20");
    expect(r.marketLow!.toString()).toBe("17");
    expect(r.marketHigh!.toString()).toBe("23");
  });

  it("does not use engine prior when MIN_DATA_POINTS_FOR_TRANSACTIONAL is met", () => {
    const points = [
      mkPoint(50, "COMPLETED_SALE"), mkPoint(50, "COMPLETED_SALE"), mkPoint(50, "COMPLETED_SALE"),
    ];
    const r = computeCompositeValue(points, { pri: 50, priConfidence: 70, engineEstimate: new Decimal("20") });
    expect(r.marketMid!.gt(new Decimal(40))).toBe(true);
  });

  it("does not trigger engine prior when engineEstimate missing", () => {
    const r = computeCompositeValue([mkPoint(10, "COMPLETED_SALE")], { pri: 50 });
    expect(r.marketMid!.toString()).toBe(new Decimal("10").toDecimalPlaces(2).toString());
  });

  it("weights recent data more than old data via time decay", () => {
    const points = [
      mkPoint(20, "COMPLETED_SALE", 0),
      mkPoint(10, "COMPLETED_SALE", 365),
    ];
    const r = computeCompositeValue(points);
    expect(r.marketMid!.gt(new Decimal("15"))).toBe(true);
  });
});
