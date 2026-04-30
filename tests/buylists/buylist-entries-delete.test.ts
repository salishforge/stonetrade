import { describe, it, expect, beforeEach, beforeAll, vi } from "vitest";
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
}));

let DELETE: typeof import("@/app/api/buylists/[id]/entries/[entryId]/route").DELETE;

beforeAll(async () => {
  ({ DELETE } = await import("@/app/api/buylists/[id]/entries/[entryId]/route"));
});

beforeEach(async () => {
  await resetDatabase();
  setMockUser(null);
});

async function seed() {
  const game = await prisma.game.create({ data: { name: "W", slug: "w", publisher: "S", website: "https://e.com" } });
  const set = await prisma.set.create({ data: { gameId: game.id, name: "Set", code: "S", totalCards: 1 } });
  const card = await prisma.card.create({ data: { gameId: game.id, setId: set.id, cardNumber: "001", name: "C", rarity: "Common", cardType: "Unit", treatment: "Classic Paper" } });
  const user = await prisma.user.create({ data: { email: "u@x.com", username: "u" } });
  const buylist = await prisma.buylist.create({ data: { userId: user.id, name: "want list" } });
  const entry = await prisma.buylistEntry.create({
    data: { buylistId: buylist.id, cardId: card.id, maxPrice: "5.00", treatment: "Classic Paper", quantity: 4 },
  });
  return { user, buylist, entry, card };
}

describe("DELETE /api/buylists/[id]/entries/[entryId]", () => {
  it("owner can delete an entry; demand drops; CardMarketValue refreshes", async () => {
    const { user, buylist, entry, card } = await seed();
    // Seed enough price history to allow recompute to produce a market value
    await prisma.priceDataPoint.create({ data: { cardId: card.id, source: "COMPLETED_SALE", price: "5.00", condition: "NEAR_MINT", treatment: "Classic Paper", verified: true } });
    setMockUser(user.id);

    const res = await DELETE(new Request("http://localhost/x"), { params: Promise.resolve({ id: buylist.id, entryId: entry.id }) });
    expect(res.status).toBe(200);

    const reloaded = await prisma.buylistEntry.findUnique({ where: { id: entry.id } });
    expect(reloaded).toBeNull();

    // Recompute trigger fired: CardMarketValue should reflect zero demand
    const market = await prisma.cardMarketValue.findUnique({ where: { cardId: card.id } });
    expect(market).not.toBeNull();
    expect(market?.totalWanted).toBe(0);
  });

  it("404 when caller does not own the buylist", async () => {
    const { buylist, entry } = await seed();
    const stranger = await prisma.user.create({ data: { email: "x@x.com", username: "stranger" } });
    setMockUser(stranger.id);

    const res = await DELETE(new Request("http://localhost/x"), { params: Promise.resolve({ id: buylist.id, entryId: entry.id }) });
    expect(res.status).toBe(404);
  });

  it("404 when entry does not belong to the named buylist", async () => {
    const { user, buylist, card } = await seed();
    const otherBuylist = await prisma.buylist.create({ data: { userId: user.id, name: "other" } });
    const otherEntry = await prisma.buylistEntry.create({
      data: { buylistId: otherBuylist.id, cardId: card.id, maxPrice: "5.00", treatment: "Classic Paper", quantity: 1 },
    });
    setMockUser(user.id);

    const res = await DELETE(new Request("http://localhost/x"), { params: Promise.resolve({ id: buylist.id, entryId: otherEntry.id }) });
    expect(res.status).toBe(404);
  });
});
