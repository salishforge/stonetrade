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
}));

let listGET: typeof import("@/app/api/collections/route").GET;
let listPOST: typeof import("@/app/api/collections/route").POST;
let cardsGET: typeof import("@/app/api/collections/[id]/cards/route").GET;
let cardsPOST: typeof import("@/app/api/collections/[id]/cards/route").POST;
let cardsDELETE: typeof import("@/app/api/collections/[id]/cards/route").DELETE;

beforeAll(async () => {
  ({ GET: listGET, POST: listPOST } = await import("@/app/api/collections/route"));
  ({ GET: cardsGET, POST: cardsPOST, DELETE: cardsDELETE } = await import("@/app/api/collections/[id]/cards/route"));
});

beforeEach(async () => {
  await resetDatabase();
  setMockUser(null);
});

async function seed() {
  const user = await prisma.user.create({ data: { email: "u@x.com", username: "u" } });
  const game = await prisma.game.create({ data: { name: "W", slug: "w", publisher: "S", website: "https://e.com" } });
  const set = await prisma.set.create({ data: { gameId: game.id, name: "Set", code: "S", totalCards: 1 } });
  const card = await prisma.card.create({ data: { gameId: game.id, setId: set.id, cardNumber: "001", name: "C", rarity: "Common", cardType: "Unit", treatment: "Classic Paper" } });
  return { user, card };
}

function postReq(url: string, body: object): NextRequest {
  return new NextRequest(new URL(url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deleteReq(url: string, body: object): NextRequest {
  return new NextRequest(new URL(url), {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/collections", () => {
  it("creates a collection owned by the caller", async () => {
    const { user } = await seed();
    setMockUser(user.id);
    const res = await listPOST(postReq("http://localhost/api/collections", { name: "Main Set", isPublic: true }));
    expect(res.status).toBe(201);
    const collection = (await res.json()).data;
    expect(collection.userId).toBe(user.id);
    expect(collection.name).toBe("Main Set");
    expect(collection.isPublic).toBe(true);
  });

  it("defaults name + isPublic", async () => {
    const { user } = await seed();
    setMockUser(user.id);
    const res = await listPOST(postReq("http://localhost/api/collections", {}));
    expect(res.status).toBe(201);
    const c = (await res.json()).data;
    expect(c.name).toBe("My Collection");
    expect(c.isPublic).toBe(false);
  });
});

describe("GET /api/collections", () => {
  it("returns only the caller's collections", async () => {
    const { user } = await seed();
    const stranger = await prisma.user.create({ data: { email: "x@x.com", username: "stranger" } });
    await prisma.collection.create({ data: { userId: user.id, name: "Mine" } });
    await prisma.collection.create({ data: { userId: stranger.id, name: "Theirs" } });

    setMockUser(user.id);
    const res = await listGET();
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe("Mine");
  });
});

describe("POST /api/collections/[id]/cards", () => {
  it("adds a card; subsequent POST increments quantity (upsert)", async () => {
    const { user, card } = await seed();
    const collection = await prisma.collection.create({ data: { userId: user.id, name: "Main" } });
    setMockUser(user.id);

    const r1 = await cardsPOST(
      postReq("http://localhost/x", { cardId: card.id, quantity: 2, treatment: "Classic Paper" }),
      { params: Promise.resolve({ id: collection.id }) },
    );
    expect(r1.status).toBe(201);

    const r2 = await cardsPOST(
      postReq("http://localhost/x", { cardId: card.id, quantity: 3, treatment: "Classic Paper" }),
      { params: Promise.resolve({ id: collection.id }) },
    );
    expect(r2.status).toBe(201);

    const all = await prisma.collectionCard.findMany({ where: { collectionId: collection.id } });
    expect(all).toHaveLength(1);
    expect(all[0].quantity).toBe(5);
  });

  it("404 when caller does not own the collection", async () => {
    const { user, card } = await seed();
    const stranger = await prisma.user.create({ data: { email: "x@x.com", username: "stranger" } });
    const collection = await prisma.collection.create({ data: { userId: user.id, name: "Mine" } });
    setMockUser(stranger.id);

    const res = await cardsPOST(
      postReq("http://localhost/x", { cardId: card.id, quantity: 1, treatment: "Classic Paper" }),
      { params: Promise.resolve({ id: collection.id }) },
    );
    expect(res.status).toBe(404);
  });

  it("400 on validation failure", async () => {
    const { user } = await seed();
    const collection = await prisma.collection.create({ data: { userId: user.id, name: "Mine" } });
    setMockUser(user.id);
    const res = await cardsPOST(
      postReq("http://localhost/x", { cardId: "", treatment: "Classic Paper" }),
      { params: Promise.resolve({ id: collection.id }) },
    );
    expect(res.status).toBe(400);
  });
});

describe("GET /api/collections/[id]/cards", () => {
  it("includes totalValue summed across cards", async () => {
    const { user, card } = await seed();
    const collection = await prisma.collection.create({ data: { userId: user.id, name: "Main" } });
    await prisma.collectionCard.create({
      data: { collectionId: collection.id, cardId: card.id, quantity: 4, condition: "NEAR_MINT", treatment: "Classic Paper" },
    });
    await prisma.cardMarketValue.create({
      data: { cardId: card.id, marketMid: "5.50" },
    });

    const res = await cardsGET(new Request("http://localhost/x"), { params: Promise.resolve({ id: collection.id }) });
    const body = await res.json();
    expect(body.totalValue).toBeCloseTo(22, 2); // 4 × 5.50
    expect(body.data).toHaveLength(1);
  });
});

describe("DELETE /api/collections/[id]/cards", () => {
  it("owner can remove a card; 403 for non-owner", async () => {
    const { user, card } = await seed();
    const stranger = await prisma.user.create({ data: { email: "x@x.com", username: "stranger" } });
    const collection = await prisma.collection.create({ data: { userId: user.id, name: "Main" } });
    const cc = await prisma.collectionCard.create({
      data: { collectionId: collection.id, cardId: card.id, quantity: 1, condition: "NEAR_MINT", treatment: "Classic Paper" },
    });

    setMockUser(stranger.id);
    const r1 = await cardsDELETE(
      deleteReq("http://localhost/x", { collectionCardId: cc.id }),
      { params: Promise.resolve({ id: collection.id }) },
    );
    expect(r1.status).toBe(403);

    setMockUser(user.id);
    const r2 = await cardsDELETE(
      deleteReq("http://localhost/x", { collectionCardId: cc.id }),
      { params: Promise.resolve({ id: collection.id }) },
    );
    expect(r2.status).toBe(200);

    const remaining = await prisma.collectionCard.findUnique({ where: { id: cc.id } });
    expect(remaining).toBeNull();
  });

  it("400 when collectionCardId is missing", async () => {
    const { user } = await seed();
    const collection = await prisma.collection.create({ data: { userId: user.id, name: "Main" } });
    setMockUser(user.id);
    const res = await cardsDELETE(
      deleteReq("http://localhost/x", {}),
      { params: Promise.resolve({ id: collection.id }) },
    );
    expect(res.status).toBe(400);
  });
});
