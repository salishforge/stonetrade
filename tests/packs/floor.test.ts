import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import {
  computePackEconomics,
  type PoolMarketLookup,
  type PoolEntryMarket,
} from "@/lib/packs/floor";
import { parseTiers } from "@/lib/packs/tiers";

function market(rows: Record<string, PoolEntryMarket | undefined>): PoolMarketLookup {
  return new Map(Object.entries(rows));
}

describe("computePackEconomics", () => {
  it("computes floor and EV for a single uniform tier", () => {
    const tiers = parseTiers([
      { name: "Common", slots: 5, pool: ["l1", "l2", "l3"], floor: "1.00" },
    ]);
    const m = market({
      l1: { marketMid: "2.00", confidence: 80 },
      l2: { marketMid: "3.00", confidence: 60 },
      l3: { marketMid: "4.00", confidence: 40 },
    });

    const e = computePackEconomics({ tiers, market: m });

    // floor = 1.00 × 5 = 5.00
    expect(e.guaranteedMinValue.toString()).toBe("5");
    // EV per slot = mean(2,3,4) = 3.00; × 5 slots = 15.00
    expect(e.expectedValue.toString()).toBe("15");
    // confidence weighted by slots (only one tier, so just mean of pool)
    expect(e.confidence).toBe(60);
    expect(e.floorViolated).toBe(false);
    expect(e.cardCount).toBe(5);
    expect(e.tiers[0].poolMin?.toString()).toBe("2");
    expect(e.tiers[0].unpricedCount).toBe(0);
  });

  it("rolls up multi-tier economics correctly", () => {
    const tiers = parseTiers([
      { name: "Hit", slots: 1, pool: ["lh1", "lh2"], floor: "10.00" },
      { name: "Common", slots: 4, pool: ["lc1", "lc2"], floor: "1.00" },
    ]);
    const m = market({
      lh1: { marketMid: "20.00", confidence: 90 },
      lh2: { marketMid: "30.00", confidence: 90 },
      lc1: { marketMid: "1.50", confidence: 50 },
      lc2: { marketMid: "2.00", confidence: 50 },
    });

    const e = computePackEconomics({ tiers, market: m });

    // floor = 10×1 + 1×4 = 14
    expect(e.guaranteedMinValue.toString()).toBe("14");
    // EV: hit slot mean = 25, common slot mean = 1.75; total = 25 + 4*1.75 = 32
    expect(e.expectedValue.toString()).toBe("32");
    expect(e.cardCount).toBe(5);
    // confidence is slot-weighted: (90*1 + 50*4)/5 = 290/5 = 58
    expect(e.confidence).toBe(58);
    expect(e.floorViolated).toBe(false);
  });

  it("flags a floor violation when pool min drops below committed floor", () => {
    const tiers = parseTiers([
      { name: "Hit", slots: 1, pool: ["lh1", "lh2"], floor: "10.00" },
    ]);
    const m = market({
      lh1: { marketMid: "20.00", confidence: 90 },
      lh2: { marketMid: "8.00", confidence: 90 }, // below the 10.00 floor
    });

    const e = computePackEconomics({ tiers, market: m });
    expect(e.floorViolated).toBe(true);
    expect(e.tiers[0].floorViolated).toBe(true);
    expect(e.tiers[0].poolMin?.toString()).toBe("8");
  });

  it("treats unpriced pool entries as missing — not as zeros — for EV", () => {
    const tiers = parseTiers([
      { name: "Hit", slots: 1, pool: ["a", "b"], floor: "5.00" },
    ]);
    const m = market({
      a: { marketMid: "10.00", confidence: 80 },
      b: { marketMid: null, confidence: null },
    });

    const e = computePackEconomics({ tiers, market: m });
    // EV uses only the priced entry: $10 per slot × 1 slot = $10.
    expect(e.expectedValue.toString()).toBe("10");
    expect(e.tiers[0].unpricedCount).toBe(1);
    // Floor commitment is unchanged regardless of our pricing gaps.
    expect(e.guaranteedMinValue.toString()).toBe("5");
    // pool min is the priced value only — null entries don't pull it down.
    expect(e.tiers[0].poolMin?.toString()).toBe("10");
    expect(e.floorViolated).toBe(false);
  });

  it("handles a tier where every entry is unpriced", () => {
    const tiers = parseTiers([
      { name: "New", slots: 2, pool: ["x", "y"], floor: "3.00" },
    ]);
    const m = market({
      x: { marketMid: null, confidence: null },
      y: { marketMid: null, confidence: null },
    });

    const e = computePackEconomics({ tiers, market: m });
    expect(e.expectedValue.toString()).toBe("0");
    expect(e.confidence).toBe(0);
    // Floor still committed; we don't punish a seller for our missing data.
    expect(e.guaranteedMinValue.toString()).toBe("6");
    expect(e.floorViolated).toBe(false);
    expect(e.tiers[0].unpricedCount).toBe(2);
  });

  it("respects custom weights for both EV and confidence", () => {
    const tiers = parseTiers([
      {
        name: "Skew",
        slots: 1,
        pool: ["a", "b"],
        weights: [9, 1], // 90% chance of "a", 10% chance of "b"
        floor: "1.00",
      },
    ]);
    const m = market({
      a: { marketMid: "2.00", confidence: 100 },
      b: { marketMid: "100.00", confidence: 0 },
    });

    const e = computePackEconomics({ tiers, market: m });
    // EV per slot = (2*9 + 100*1) / 10 = 11.8
    expect(new Decimal(e.expectedValue).toNumber()).toBeCloseTo(11.8, 6);
    // Confidence = (100*9 + 0*1) / 10 = 90
    expect(e.tiers[0].confidence).toBe(90);
  });

  it("excludes zero-weight pool entries from EV", () => {
    const tiers = parseTiers([
      {
        name: "Pinned",
        slots: 1,
        pool: ["a", "b"],
        weights: [0, 1], // "a" cannot be drawn
        floor: "1.00",
      },
    ]);
    const m = market({
      a: { marketMid: "100.00", confidence: 100 },
      b: { marketMid: "5.00", confidence: 100 },
    });

    const e = computePackEconomics({ tiers, market: m });
    expect(e.expectedValue.toString()).toBe("5");
    // pool min should also exclude the zero-weight entry — it's not in the
    // draw distribution, so its price is irrelevant to floor verification.
    expect(e.tiers[0].poolMin?.toString()).toBe("5");
  });
});
