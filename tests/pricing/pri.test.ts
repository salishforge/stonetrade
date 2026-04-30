import { describe, it, expect } from "vitest";
import { computePRI } from "@/lib/engine/pri";

describe("computePRI", () => {
  it("returns zero pri and zero confidence when all axes null", () => {
    expect(computePRI({ dbsScore: null, deckInclusionPct: null, winRateWhenIncluded: null, avgCopiesPlayed: null, replacementRate: null })).toEqual({ pri: 0, confidence: 0 });
  });

  it("single axis present dominates output", () => {
    const r = computePRI({ deckInclusionPct: 80, dbsScore: null, winRateWhenIncluded: null, avgCopiesPlayed: null, replacementRate: null });
    expect(r.pri).toBe(80);
    expect(r.confidence).toBe(20);
  });

  it("all axes maxed produces pri 100 and confidence 100", () => {
    const r = computePRI({ deckInclusionPct: 100, dbsScore: 100, winRateWhenIncluded: 100, avgCopiesPlayed: 4, replacementRate: 0 });
    expect(r.pri).toBe(100);
    expect(r.confidence).toBe(100);
  });

  it("high replacement rate inverts to lower pri", () => {
    const r = computePRI({ deckInclusionPct: 50, dbsScore: 50, winRateWhenIncluded: 50, avgCopiesPlayed: 2, replacementRate: 100 });
    expect(r.pri).toBe(45);
  });

  it("clamps out-of-range values without throwing", () => {
    const r = computePRI({ deckInclusionPct: 200, dbsScore: -50, winRateWhenIncluded: 100, avgCopiesPlayed: 10, replacementRate: 50 });
    expect(r.pri).toBeGreaterThanOrEqual(0);
    expect(r.pri).toBeLessThanOrEqual(100);
    expect(Number.isInteger(r.pri)).toBe(true);
  });

  it("confidence proportional to non-null axes", () => {
    const r = computePRI({ deckInclusionPct: 50, winRateWhenIncluded: 50, dbsScore: null, avgCopiesPlayed: null, replacementRate: null });
    expect(r.confidence).toBe(40);
  });
});
