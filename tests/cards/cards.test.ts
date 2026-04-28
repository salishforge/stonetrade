import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { resetDatabase, prisma } from "../db";

let listGET: typeof import("@/app/api/cards/route").GET;
let detailGET: typeof import("@/app/api/cards/[id]/route").GET;

beforeAll(async () => {
  ({ GET: listGET } = await import("@/app/api/cards/route"));
  ({ GET: detailGET } = await import("@/app/api/cards/[id]/route"));
});

beforeEach(async () => {
  await resetDatabase();
});

async function seedCards() {
  const game = await prisma.game.create({ data: { name: "Wonders", slug: "wotf", publisher: "S", website: "https://e.com" } });
  const set = await prisma.set.create({ data: { gameId: game.id, name: "Existence", code: "EX1", totalCards: 100 } });
  const fire = await prisma.card.create({ data: { gameId: game.id, setId: set.id, cardNumber: "001", name: "Fire", rarity: "Rare", cardType: "Unit", treatment: "Classic Paper" } });
  const fireFoil = await prisma.card.create({ data: { gameId: game.id, setId: set.id, cardNumber: "001", name: "Fire", rarity: "Rare", cardType: "Unit", treatment: "Classic Foil" } });
  const ocean = await prisma.card.create({ data: { gameId: game.id, setId: set.id, cardNumber: "002", name: "Ocean", rarity: "Common", cardType: "Unit", treatment: "Classic Paper" } });
  return { game, set, fire, fireFoil, ocean };
}

function makeRequest(query: Record<string, string> = {}): NextRequest {
  const url = new URL("http://localhost/api/cards");
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  return new NextRequest(url, { method: "GET" });
}

describe("GET /api/cards", () => {
  it("default: returns Classic Paper variants only", async () => {
    await seedCards();
    const res = await listGET(makeRequest());
    const body = await res.json();
    expect(body.data.every((c: { treatment: string }) => c.treatment === "Classic Paper")).toBe(true);
    expect(body.data).toHaveLength(2);
  });

  it("treatment filter overrides the default", async () => {
    await seedCards();
    const res = await listGET(makeRequest({ treatment: "Classic Foil" }));
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].treatment).toBe("Classic Foil");
  });

  it("filters by rarity", async () => {
    await seedCards();
    const res = await listGET(makeRequest({ rarity: "Rare" }));
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe("Fire");
  });

  it("substring search by name (case-insensitive)", async () => {
    await seedCards();
    const res = await listGET(makeRequest({ q: "fir" }));
    const body = await res.json();
    expect(body.data.some((c: { name: string }) => c.name === "Fire")).toBe(true);
  });

  it("respects pagination + sort", async () => {
    await seedCards();
    const res = await listGET(makeRequest({ sort: "name", limit: "1", page: "1" }));
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe("Fire"); // alphabetical first
  });
});

describe("GET /api/cards/[id]", () => {
  it("returns the card with marketValue + listings + priceHistory + treatments", async () => {
    const { fire, fireFoil } = await seedCards();
    await prisma.cardMarketValue.create({ data: { cardId: fire.id, marketMid: "12.50", confidence: 80 } });

    const res = await detailGET(new Request("http://localhost/x"), { params: Promise.resolve({ id: fire.id }) });
    expect(res.status).toBe(200);
    const data = (await res.json()).data;
    expect(data.id).toBe(fire.id);
    expect(data.name).toBe("Fire");
    // Treatments include both Classic Paper and Classic Foil for the same cardNumber
    const ids = data.treatments.map((t: { id: string }) => t.id);
    expect(ids).toContain(fire.id);
    expect(ids).toContain(fireFoil.id);
  });

  it("404 when missing", async () => {
    const res = await detailGET(new Request("http://localhost/x"), { params: Promise.resolve({ id: "ckxxxxxxxxxxxxxxxxxxxxxxx" }) });
    expect(res.status).toBe(404);
  });
});
