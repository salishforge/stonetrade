import { describe, it, expect, beforeEach, beforeAll, vi } from "vitest";
import { resetDatabase, prisma } from "../db";

const fetchCardStatsMock = vi.fn();
const fetchAllCardsMock = vi.fn();

vi.mock("@/lib/platform/client", () => ({
  fetchCardStats: (...args: unknown[]) => fetchCardStatsMock(...args),
  fetchAllCards: (...args: unknown[]) => fetchAllCardsMock(...args),
}));

let syncEngineMetrics: typeof import("@/lib/platform/sync-engine-metrics").syncEngineMetrics;

beforeAll(async () => {
  ({ syncEngineMetrics } = await import("@/lib/platform/sync-engine-metrics"));
});

beforeEach(async () => {
  await resetDatabase();
  fetchCardStatsMock.mockReset();
  fetchAllCardsMock.mockReset();
});

async function seedLocalCards() {
  const game = await prisma.game.create({
    data: { name: "Wonders", slug: "wotf", publisher: "Salishforge", website: "https://example.com" },
  });
  const set = await prisma.set.create({
    data: { gameId: game.id, name: "Existence", code: "EX1", totalCards: 401 },
  });
  const cardClassic = await prisma.card.create({
    data: {
      gameId: game.id,
      setId: set.id,
      cardNumber: "001/401",
      name: "Card 001",
      rarity: "Common",
      cardType: "UNIT",
      treatment: "Classic Paper",
    },
  });
  const cardFoil = await prisma.card.create({
    data: {
      gameId: game.id,
      setId: set.id,
      cardNumber: "001/401",
      name: "Card 001",
      rarity: "Common",
      cardType: "UNIT",
      treatment: "Classic Foil",
    },
  });
  const cardOther = await prisma.card.create({
    data: {
      gameId: game.id,
      setId: set.id,
      cardNumber: "002/401",
      name: "Card 002",
      rarity: "Common",
      cardType: "UNIT",
      treatment: "Classic Paper",
    },
  });
  return { game, set, cardClassic, cardFoil, cardOther };
}

describe("syncEngineMetrics", () => {
  it("happy path: maps platform stats to CardEngineMetrics, upserts both treatment variants", async () => {
    const { cardClassic, cardFoil, cardOther } = await seedLocalCards();

    fetchCardStatsMock.mockResolvedValue({
      format: null,
      decks_total: 100,
      cards: [
        {
          card_number: "001",
          decks_containing: 25,
          total_quantity: 75,
          avg_copies_when_included: 3.0,
          avg_win_rate: 0.55,
          weighted_score: 41.25,
        },
        {
          card_number: "002",
          decks_containing: 10,
          total_quantity: 40,
          avg_copies_when_included: 4.0,
          avg_win_rate: 0.6,
          weighted_score: 24.0,
        },
      ],
    });
    fetchAllCardsMock.mockResolvedValue([
      { card_number: "001", dbs_score: 80 },
      { card_number: "002", dbs_score: 60 },
    ]);

    const result = await syncEngineMetrics();

    expect(result.fetched).toBe(2);
    expect(result.matched).toBe(2); // cards 001 and 002 found locally
    expect(result.upserted).toBe(3); // 001 has two variants + 002 has one

    const classicMetrics = await prisma.cardEngineMetrics.findUnique({ where: { cardId: cardClassic.id } });
    expect(classicMetrics).not.toBeNull();
    expect(classicMetrics?.dbsScore).toBe(80);
    expect(Number(classicMetrics?.deckInclusionPct)).toBe(25); // 25/100 × 100
    expect(Number(classicMetrics?.winRateWhenIncluded)).toBe(55); // 0.55 × 100
    expect(Number(classicMetrics?.avgCopiesPlayed)).toBe(3);
    expect(classicMetrics?.replacementRate).toBeNull();
    expect(classicMetrics?.pri).not.toBeNull();
    expect(classicMetrics?.priConfidence).toBe(80); // 4 of 5 axes present

    const foilMetrics = await prisma.cardEngineMetrics.findUnique({ where: { cardId: cardFoil.id } });
    expect(foilMetrics?.dbsScore).toBe(80); // same identity, both variants get the same metrics

    const otherMetrics = await prisma.cardEngineMetrics.findUnique({ where: { cardId: cardOther.id } });
    expect(otherMetrics?.dbsScore).toBe(60);
  });

  it("skips cards that aren't seeded locally", async () => {
    await seedLocalCards();
    fetchCardStatsMock.mockResolvedValue({
      format: null,
      decks_total: 50,
      cards: [
        {
          card_number: "999", // not seeded
          decks_containing: 10,
          total_quantity: 30,
          avg_copies_when_included: 3.0,
          avg_win_rate: 0.5,
          weighted_score: 15.0,
        },
      ],
    });
    fetchAllCardsMock.mockResolvedValue([{ card_number: "999", dbs_score: 50 }]);

    const result = await syncEngineMetrics();
    expect(result.fetched).toBe(1);
    expect(result.matched).toBe(0);
    expect(result.upserted).toBe(0);

    const all = await prisma.cardEngineMetrics.findMany();
    expect(all).toHaveLength(0);
  });

  it("treats win-rate as null when no games have been played (all avg_win_rate are 0)", async () => {
    const { cardClassic } = await seedLocalCards();
    fetchCardStatsMock.mockResolvedValue({
      format: null,
      decks_total: 10,
      cards: [
        {
          card_number: "001",
          decks_containing: 5,
          total_quantity: 15,
          avg_copies_when_included: 3.0,
          avg_win_rate: 0,
          weighted_score: 0,
        },
      ],
    });
    fetchAllCardsMock.mockResolvedValue([{ card_number: "001", dbs_score: 75 }]);

    await syncEngineMetrics();

    const m = await prisma.cardEngineMetrics.findUnique({ where: { cardId: cardClassic.id } });
    expect(m?.winRateWhenIncluded).toBeNull();
    // PRI confidence: 3 of 5 axes (dbs, deckInclusion, avgCopies) → 60%
    expect(m?.priConfidence).toBe(60);
  });

  it("computes deckInclusionPct as null when decks_total is 0 (empty format)", async () => {
    const { cardClassic } = await seedLocalCards();
    fetchCardStatsMock.mockResolvedValue({
      format: "draft",
      decks_total: 0,
      cards: [
        // Implausible — if decks_total=0 the platform won't return any cards —
        // but defensive: if it does, we don't want a divide-by-zero.
        {
          card_number: "001",
          decks_containing: 0,
          total_quantity: 0,
          avg_copies_when_included: 0,
          avg_win_rate: 0,
          weighted_score: 0,
        },
      ],
    });
    fetchAllCardsMock.mockResolvedValue([{ card_number: "001", dbs_score: 75 }]);

    await syncEngineMetrics({ format: "draft" });

    const m = await prisma.cardEngineMetrics.findUnique({ where: { cardId: cardClassic.id } });
    expect(m?.deckInclusionPct).toBeNull();
    expect(m?.format).toBe("draft");
  });

  it("upsert: re-running updates existing rows in place", async () => {
    const { cardClassic } = await seedLocalCards();

    fetchCardStatsMock.mockResolvedValueOnce({
      format: null,
      decks_total: 100,
      cards: [{
        card_number: "001",
        decks_containing: 10,
        total_quantity: 30,
        avg_copies_when_included: 3.0,
        avg_win_rate: 0.4,
        weighted_score: 12.0,
      }],
    });
    fetchAllCardsMock.mockResolvedValueOnce([{ card_number: "001", dbs_score: 75 }]);
    await syncEngineMetrics();

    fetchCardStatsMock.mockResolvedValueOnce({
      format: null,
      decks_total: 100,
      cards: [{
        card_number: "001",
        decks_containing: 30, // climbed in popularity
        total_quantity: 90,
        avg_copies_when_included: 3.0,
        avg_win_rate: 0.65,
        weighted_score: 58.5,
      }],
    });
    fetchAllCardsMock.mockResolvedValueOnce([{ card_number: "001", dbs_score: 80 }]);
    await syncEngineMetrics();

    const m = await prisma.cardEngineMetrics.findUnique({ where: { cardId: cardClassic.id } });
    expect(Number(m?.deckInclusionPct)).toBe(30);
    expect(m?.dbsScore).toBe(80);

    const count = await prisma.cardEngineMetrics.count({ where: { cardId: cardClassic.id } });
    expect(count).toBe(1); // upsert, not insert
  });

  it("passes format to fetchCardStats and persists it on the row", async () => {
    const { cardClassic } = await seedLocalCards();
    fetchCardStatsMock.mockResolvedValue({
      format: "seeker",
      decks_total: 88,
      cards: [{
        card_number: "001",
        decks_containing: 12,
        total_quantity: 36,
        avg_copies_when_included: 3.0,
        avg_win_rate: 0.5,
        weighted_score: 18.0,
      }],
    });
    fetchAllCardsMock.mockResolvedValue([{ card_number: "001", dbs_score: 70 }]);

    await syncEngineMetrics({ format: "seeker" });

    expect(fetchCardStatsMock).toHaveBeenCalledWith({ format_name: "seeker", limit: 2000 });
    const m = await prisma.cardEngineMetrics.findUnique({ where: { cardId: cardClassic.id } });
    expect(m?.format).toBe("seeker");
  });
});
