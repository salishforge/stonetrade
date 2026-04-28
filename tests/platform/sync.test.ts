import { describe, it, expect, beforeEach, beforeAll, vi } from "vitest";
import { resetDatabase, prisma } from "../db";

const fetchAllCardsMock = vi.fn();
const fetchCardStatsMock = vi.fn();

vi.mock("@/lib/platform/client", () => ({
  fetchAllCards: (...args: unknown[]) => fetchAllCardsMock(...args),
  fetchCardStats: (...args: unknown[]) => fetchCardStatsMock(...args),
}));

let syncFromPlatform: typeof import("@/lib/platform/sync").syncFromPlatform;

beforeAll(async () => {
  ({ syncFromPlatform } = await import("@/lib/platform/sync"));
});

beforeEach(async () => {
  await resetDatabase();
  fetchAllCardsMock.mockReset();
  fetchCardStatsMock.mockReset();
});

describe("syncFromPlatform", () => {
  it("after card sync, runs engine-metrics sync against the same cards", async () => {
    fetchAllCardsMock.mockResolvedValue([
      {
        card_number: "001",
        name: "Card 001",
        card_type: "Land",
        power: null,
        cost: 0,
        orbital: "Order",
        tier: "Primary",
        rarity: "common",
        abilities: [],
        parsed_abilities: [],
        synergies: [],
        counters: [],
        dbs_score: 50,
        set_name: "Existence",
        release_date: null,
        classes: [],
        faction: null,
        is_core: false,
        is_equipment: false,
        is_token: false,
      },
    ]);
    fetchCardStatsMock.mockResolvedValue({
      format: null,
      decks_total: 100,
      cards: [{
        card_number: "001",
        decks_containing: 20,
        total_quantity: 60,
        avg_copies_when_included: 3.0,
        avg_win_rate: 0.5,
        weighted_score: 30.0,
      }],
    });

    const result = await syncFromPlatform();

    expect(result.synced).toBeGreaterThan(0);
    expect(result.engineMetrics).not.toBeNull();
    expect(result.engineMetrics?.fetched).toBe(1);
    expect(result.engineMetrics?.matched).toBeGreaterThan(0);

    const created = await prisma.cardEngineMetrics.findFirst();
    expect(created).not.toBeNull();
    expect(Number(created?.deckInclusionPct)).toBe(20);
  });

  it("engine-metrics failure does not roll back the card sync", async () => {
    fetchAllCardsMock.mockResolvedValue([
      {
        card_number: "001",
        name: "Card 001",
        card_type: "Land",
        power: null,
        cost: 0,
        orbital: "Order",
        tier: "Primary",
        rarity: "common",
        abilities: [],
        parsed_abilities: [],
        synergies: [],
        counters: [],
        dbs_score: 50,
        set_name: "Existence",
        release_date: null,
        classes: [],
        faction: null,
        is_core: false,
        is_equipment: false,
        is_token: false,
      },
    ]);
    fetchCardStatsMock.mockRejectedValue(new Error("Deck DB down"));

    const result = await syncFromPlatform();
    expect(result.synced).toBeGreaterThan(0);
    expect(result.engineMetrics).toBeNull();

    const cardCount = await prisma.card.count();
    expect(cardCount).toBeGreaterThan(0);
  });
});
