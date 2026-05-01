import { describe, it, expect } from "vitest";
import { explainMovement, type AttributionInput } from "@/lib/attribution/explain";

const NOW = new Date("2026-05-01T12:00:00Z");

function input(overrides: Partial<AttributionInput> = {}): AttributionInput {
  return {
    trend7d: 0,
    scarcityTier: null,
    totalAvailable: 0,
    totalWanted: 0,
    priCurrent: null,
    priPrior: null,
    recentSales7d: 0,
    priorSales7d: 0,
    recentTournaments: [],
    now: NOW,
    ...overrides,
  };
}

describe("explainMovement", () => {
  it("returns a quiet headline when nothing crossed the noise floor", () => {
    const out = explainMovement(input({ trend7d: 1.2, priCurrent: 50, priPrior: 49 }));
    expect(out.quiet).toBe(true);
    expect(out.headline).toMatch(/quiet week/i);
    expect(out.signals).toHaveLength(0);
  });

  it("flags an engine shift when PRI moved more than the noise floor", () => {
    const out = explainMovement(
      input({ priCurrent: 70, priPrior: 50, trend7d: 18 }),
    );
    expect(out.quiet).toBe(false);
    expect(out.tone).toBe("up");
    expect(out.headline).toMatch(/engine read jumped \+20 PRI/i);
    expect(out.signals[0]?.label).toBe("ENGINE");
  });

  it("attributes a tournament when one finished recently and PRI moved sharply", () => {
    const out = explainMovement(
      input({
        priCurrent: 72,
        priPrior: 55,
        trend7d: 22,
        recentTournaments: [{ name: "Dragon Cup #4", eventDate: new Date("2026-04-26T00:00:00Z") }],
      }),
    );
    expect(out.headline).toMatch(/following dragon cup #4/i);
    expect(out.headline).toMatch(/\+17 PRI/);
    expect(out.signals[0]?.label).toMatch(/ENGINE|TOURNAMENT/);
  });

  it("does not attribute a stale tournament outside the echo window", () => {
    const out = explainMovement(
      input({
        priCurrent: 72,
        priPrior: 55,
        trend7d: 22,
        recentTournaments: [{ name: "Dragon Cup #1", eventDate: new Date("2026-04-01T00:00:00Z") }],
      }),
    );
    expect(out.headline).not.toMatch(/dragon cup #1/i);
  });

  it("calls a supply shock when scarcity tier hits acute", () => {
    const out = explainMovement(
      input({
        scarcityTier: "acute",
        totalAvailable: 2,
        totalWanted: 18,
        trend7d: 6,
      }),
    );
    expect(out.headline).toMatch(/supply tightened to acute/i);
    expect(out.tone).toBe("supply");
  });

  it("flags a volume surge", () => {
    const out = explainMovement(
      input({ recentSales7d: 12, priorSales7d: 4, trend7d: 7 }),
    );
    expect(out.headline).toMatch(/sales accelerated/i);
    expect(out.headline).toMatch(/12 trades/);
  });

  it("falls back to drift wording when trend exists but no signal does", () => {
    const out = explainMovement(input({ trend7d: -7.3 }));
    expect(out.headline).toMatch(/price drifted -7\.3%/i);
    expect(out.tone).toBe("down");
  });
});
