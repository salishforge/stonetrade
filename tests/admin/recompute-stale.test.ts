import { describe, it, expect, beforeEach, beforeAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { resetDatabase, prisma } from "../db";

let currentMockUserId: string | null = null;
function setMockUser(id: string | null) { currentMockUserId = id; }

vi.mock("@/lib/auth", () => ({
  requireUser: async () => {
    if (!currentMockUserId) throw new Error("No mock user set");
    const user = await prisma.user.findUnique({ where: { id: currentMockUserId } });
    if (!user) throw new Error("Mock user not found");
    return user;
  },
  getAdminUser: async () => {
    if (!currentMockUserId) return null;
    const user = await prisma.user.findUnique({ where: { id: currentMockUserId } });
    if (!user || user.role !== "ADMIN") return null;
    return user;
  },
}));

let POST: typeof import("@/app/api/admin/recompute-stale/route").POST;

beforeAll(async () => {
  ({ POST } = await import("@/app/api/admin/recompute-stale/route"));
});

beforeEach(async () => {
  await resetDatabase();
  setMockUser(null);
});

async function seed() {
  const game = await prisma.game.create({ data: { name: "W", slug: "w", publisher: "S", website: "https://e.com" } });
  const set = await prisma.set.create({ data: { gameId: game.id, name: "Set", code: "S", totalCards: 1 } });
  const admin = await prisma.user.create({ data: { email: "a@x.com", username: "admin", role: "ADMIN" } });
  const regular = await prisma.user.create({ data: { email: "r@x.com", username: "regular" } });
  return { game, set, admin, regular };
}

async function makeCard(gameId: string, setId: string, suffix: string) {
  return prisma.card.create({
    data: { gameId, setId, cardNumber: `00${suffix}`, name: `Card ${suffix}`, rarity: "Common", cardType: "Unit", treatment: "Classic Paper" },
  });
}

async function seedMarketValue(cardId: string, lastUpdated: Date) {
  // Create a price data point so subsequent recompute has data to work with
  await prisma.priceDataPoint.create({
    data: { cardId, source: "COMPLETED_SALE", price: "5.00", condition: "NEAR_MINT", treatment: "Classic Paper", verified: true },
  });
  await prisma.cardMarketValue.create({
    data: { cardId, marketLow: "4", marketMid: "5", marketHigh: "6", confidence: 50, lastUpdated },
  });
}

function makeRequest(query: Record<string, string> = {}): NextRequest {
  const url = new URL("http://localhost/api/admin/recompute-stale");
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  return new NextRequest(url, { method: "POST" });
}

describe("POST /api/admin/recompute-stale", () => {
  it("recomputes cards with lastUpdated past threshold; leaves fresh ones alone", async () => {
    const { admin, game, set } = await seed();
    const cardOld = await makeCard(game.id, set.id, "1");
    const cardFresh = await makeCard(game.id, set.id, "2");

    // 2 hours stale
    await seedMarketValue(cardOld.id, new Date(Date.now() - 2 * 60 * 60 * 1000));
    // 5 minutes fresh
    await seedMarketValue(cardFresh.id, new Date(Date.now() - 5 * 60 * 1000));

    setMockUser(admin.id);
    const res = await POST(makeRequest({ olderThanMinutes: "60" }));
    expect(res.status).toBe(200);
    const data = (await res.json()).data;

    expect(data.candidates).toBe(1);
    expect(data.recomputed).toBe(1);
    expect(data.failed).toBe(0);
    expect(data.olderThanMinutes).toBe(60);

    // The stale row should now be fresh
    const reloadedOld = await prisma.cardMarketValue.findUnique({ where: { cardId: cardOld.id } });
    expect(reloadedOld?.lastUpdated.getTime()).toBeGreaterThan(Date.now() - 60 * 1000);

    // The fresh row's lastUpdated should not have moved
    const reloadedFresh = await prisma.cardMarketValue.findUnique({ where: { cardId: cardFresh.id } });
    expect(reloadedFresh?.lastUpdated.getTime()).toBeLessThan(Date.now() - 60 * 1000);
  });

  it("403 when caller is not admin", async () => {
    const { regular } = await seed();
    setMockUser(regular.id);
    const res = await POST(makeRequest());
    expect(res.status).toBe(403);
  });

  it("respects maxCards cap", async () => {
    const { admin, game, set } = await seed();
    const cards = await Promise.all([
      makeCard(game.id, set.id, "1"),
      makeCard(game.id, set.id, "2"),
      makeCard(game.id, set.id, "3"),
    ]);
    // All 3 stale by 2h
    for (const c of cards) {
      await seedMarketValue(c.id, new Date(Date.now() - 2 * 60 * 60 * 1000));
    }

    setMockUser(admin.id);
    const res = await POST(makeRequest({ olderThanMinutes: "60", maxCards: "2" }));
    expect(res.status).toBe(200);
    const data = (await res.json()).data;
    expect(data.candidates).toBe(2);
    expect(data.recomputed).toBe(2);
  });

  it("400 on invalid olderThanMinutes", async () => {
    const { admin } = await seed();
    setMockUser(admin.id);
    const res = await POST(makeRequest({ olderThanMinutes: "0" }));
    expect(res.status).toBe(400);
  });

  it("returns 0 candidates when nothing is stale", async () => {
    const { admin, game, set } = await seed();
    const card = await makeCard(game.id, set.id, "1");
    await seedMarketValue(card.id, new Date(Date.now() - 1000)); // 1s old

    setMockUser(admin.id);
    const res = await POST(makeRequest({ olderThanMinutes: "60" }));
    expect(res.status).toBe(200);
    expect((await res.json()).data.candidates).toBe(0);
  });
});
