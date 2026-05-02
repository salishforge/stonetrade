import { describe, it, expect } from "vitest";
import { parseTiers, safeParseTiers, totalSlotsFromTiers } from "@/lib/packs/tiers";

describe("tiersSchema", () => {
  it("accepts a minimal single-tier pack", () => {
    const tiers = parseTiers([
      { name: "Common slot", slots: 4, pool: ["l1", "l2", "l3"], floor: "1.00" },
    ]);
    expect(tiers).toHaveLength(1);
    expect(tiers[0].slots).toBe(4);
    expect(tiers[0].weights).toBeUndefined();
  });

  it("accepts decimal floors as numbers and canonicalises to strings", () => {
    const tiers = parseTiers([
      { name: "Hit", slots: 1, pool: ["l1"], floor: 12.5 },
    ]);
    expect(tiers[0].floor).toBe("12.5");
  });

  it("rejects floors with more than 2 decimals", () => {
    const r = safeParseTiers([
      { name: "Hit", slots: 1, pool: ["l1"], floor: "1.234" },
    ]);
    expect(r.success).toBe(false);
  });

  it("rejects negative floors", () => {
    const r = safeParseTiers([
      { name: "Hit", slots: 1, pool: ["l1"], floor: "-0.50" },
    ]);
    expect(r.success).toBe(false);
  });

  it("rejects empty pools", () => {
    const r = safeParseTiers([
      { name: "Hit", slots: 1, pool: [], floor: "1.00" },
    ]);
    expect(r.success).toBe(false);
  });

  it("rejects packs with zero tiers", () => {
    const r = safeParseTiers([]);
    expect(r.success).toBe(false);
  });

  it("rejects weights of wrong length", () => {
    const r = safeParseTiers([
      { name: "Hit", slots: 1, pool: ["l1", "l2"], weights: [1], floor: "1.00" },
    ]);
    expect(r.success).toBe(false);
  });

  it("rejects all-zero weights", () => {
    const r = safeParseTiers([
      { name: "Hit", slots: 1, pool: ["l1", "l2"], weights: [0, 0], floor: "1.00" },
    ]);
    expect(r.success).toBe(false);
  });

  it("totalSlotsFromTiers sums across tiers", () => {
    const tiers = parseTiers([
      { name: "A", slots: 1, pool: ["l1"], floor: "5.00" },
      { name: "B", slots: 3, pool: ["l2"], floor: "1.00" },
      { name: "C", slots: 4, pool: ["l3"], floor: "0.50" },
    ]);
    expect(totalSlotsFromTiers(tiers)).toBe(8);
  });
});
