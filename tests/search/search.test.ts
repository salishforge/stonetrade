import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { resetDatabase, prisma } from "../db";

let GET: typeof import("@/app/api/search/route").GET;

beforeAll(async () => {
  ({ GET } = await import("@/app/api/search/route"));
});

beforeEach(async () => {
  await resetDatabase();
});

async function seedCards() {
  const game = await prisma.game.create({
    data: { name: "Wonders", slug: "wotf", publisher: "S", website: "https://e.com" },
  });
  const set = await prisma.set.create({
    data: { gameId: game.id, name: "Existence", code: "EX1", totalCards: 100 },
  });
  const flame = await prisma.card.create({
    data: {
      gameId: game.id, setId: set.id, cardNumber: "001", name: "Flame Wielder",
      rarity: "Rare", cardType: "Unit", treatment: "Classic Paper",
      rulesText: "Deal 3 damage to target creature.",
      flavorText: "Fire walks where I will it.",
    },
  });
  const ocean = await prisma.card.create({
    data: {
      gameId: game.id, setId: set.id, cardNumber: "002", name: "Ocean Keeper",
      rarity: "Common", cardType: "Unit", treatment: "Classic Paper",
      rulesText: "Counter target spell.",
      flavorText: "The deep remembers all.",
    },
  });
  const flameWisp = await prisma.card.create({
    data: {
      gameId: game.id, setId: set.id, cardNumber: "003", name: "Flame Wisp",
      rarity: "Common", cardType: "Unit", treatment: "Classic Paper",
      rulesText: "Flying. Haste.",
    },
  });
  return { game, set, flame, ocean, flameWisp };
}

function makeRequest(query: Record<string, string>): NextRequest {
  const url = new URL("http://localhost/api/search");
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  return new NextRequest(url, { method: "GET" });
}

describe("GET /api/search", () => {
  it("matches by card name", async () => {
    const { flame, flameWisp } = await seedCards();

    const res = await GET(makeRequest({ q: "flame" }));
    expect(res.status).toBe(200);
    const body = await res.json();

    const ids = body.data.map((c: { id: string }) => c.id);
    expect(ids).toContain(flame.id);
    expect(ids).toContain(flameWisp.id);
    expect(body.total).toBe(2);
  });

  it("ranks name matches above body matches", async () => {
    const { flame } = await seedCards();
    // ocean has 'fire walks' in flavor only; flame has 'flame' in name (weight A)
    const res = await GET(makeRequest({ q: "flame" }));
    const body = await res.json();
    // The first result must be the card with 'flame' in its name
    expect(body.data[0].id).toBe(flame.id);
  });

  it("matches by rules text", async () => {
    await seedCards();
    const res = await GET(makeRequest({ q: "counter" }));
    const body = await res.json();
    expect(body.data.some((c: { name: string }) => c.name === "Ocean Keeper")).toBe(true);
  });

  it("matches by flavor text (lowest weight)", async () => {
    await seedCards();
    const res = await GET(makeRequest({ q: "deep" }));
    const body = await res.json();
    expect(body.data.some((c: { name: string }) => c.name === "Ocean Keeper")).toBe(true);
  });

  it("returns empty when no match", async () => {
    await seedCards();
    const res = await GET(makeRequest({ q: "xyznonexistent" }));
    const body = await res.json();
    expect(body.data).toEqual([]);
    expect(body.total).toBe(0);
  });

  it("400 on missing query", async () => {
    const res = await GET(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("paginates correctly", async () => {
    await seedCards();
    // 'unit' would match abilities/cardType but only via rulesText/flavorText.
    // Use 'flame' which matches 2 cards; request limit=1.
    const res = await GET(makeRequest({ q: "flame", limit: "1", page: "1" }));
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.total).toBe(2);
    expect(body.totalPages).toBe(2);
  });

  it("includes market value snippet when present", async () => {
    const { flame } = await seedCards();
    await prisma.cardMarketValue.create({
      data: { cardId: flame.id, marketMid: "12.50", confidence: 75 },
    });
    const res = await GET(makeRequest({ q: "flame wielder" }));
    const body = await res.json();
    const target = body.data.find((c: { id: string }) => c.id === flame.id);
    expect(target.marketValue?.marketMid).toBe("12.50");
    expect(target.marketValue?.confidence).toBe(75);
  });

  it("handles user-supplied special characters safely (websearch_to_tsquery)", async () => {
    await seedCards();
    // Quotes are valid websearch syntax for phrase queries
    const res = await GET(makeRequest({ q: '"flame wielder"' }));
    expect(res.status).toBe(200);
  });
});
