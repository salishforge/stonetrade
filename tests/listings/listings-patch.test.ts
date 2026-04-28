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

let GET: typeof import("@/app/api/listings/[id]/route").GET;
let PATCH: typeof import("@/app/api/listings/[id]/route").PATCH;
let DELETE: typeof import("@/app/api/listings/[id]/route").DELETE;

beforeAll(async () => {
  ({ GET, PATCH, DELETE } = await import("@/app/api/listings/[id]/route"));
});

beforeEach(async () => {
  await resetDatabase();
  setMockUser(null);
});

async function seedListing() {
  const game = await prisma.game.create({ data: { name: "W", slug: "w", publisher: "S", website: "https://e.com" } });
  const set = await prisma.set.create({ data: { gameId: game.id, name: "Set", code: "S", totalCards: 1 } });
  const card = await prisma.card.create({ data: { gameId: game.id, setId: set.id, cardNumber: "001", name: "C", rarity: "Common", cardType: "Unit", treatment: "Classic Paper" } });
  const seller = await prisma.user.create({ data: { email: "s@x.com", username: "seller" } });
  const listing = await prisma.listing.create({ data: { sellerId: seller.id, cardId: card.id, price: "10.00", condition: "NEAR_MINT", treatment: "Classic Paper", type: "SINGLE", quantity: 5, quantitySold: 0, shippingOptions: [], status: "ACTIVE", allowOffers: true } });
  return { listing, seller };
}

function patchReq(body: object): NextRequest {
  return new NextRequest(new URL("http://localhost/x"), {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/listings/[id]", () => {
  it("owner can update price + quantity + allowOffers", async () => {
    const { listing, seller } = await seedListing();
    setMockUser(seller.id);
    const res = await PATCH(patchReq({ price: 12.5, quantity: 3, allowOffers: false }), { params: Promise.resolve({ id: listing.id }) });
    expect(res.status).toBe(200);
    const reloaded = await prisma.listing.findUnique({ where: { id: listing.id } });
    expect(Number(reloaded?.price)).toBe(12.5);
    expect(reloaded?.quantity).toBe(3);
    expect(reloaded?.allowOffers).toBe(false);
  });

  it("403 when caller is not the seller", async () => {
    const { listing } = await seedListing();
    const stranger = await prisma.user.create({ data: { email: "x@x.com", username: "stranger" } });
    setMockUser(stranger.id);
    const res = await PATCH(patchReq({ price: 5 }), { params: Promise.resolve({ id: listing.id }) });
    expect(res.status).toBe(403);
  });

  it("404 when listing does not exist", async () => {
    const seller = await prisma.user.create({ data: { email: "s@x.com", username: "seller" } });
    setMockUser(seller.id);
    const res = await PATCH(patchReq({ price: 5 }), { params: Promise.resolve({ id: "ckxxxxxxxxxxxxxxxxxxxxxxx" }) });
    expect(res.status).toBe(404);
  });

  it("400 on validation failure (negative price)", async () => {
    const { listing, seller } = await seedListing();
    setMockUser(seller.id);
    const res = await PATCH(patchReq({ price: -5 }), { params: Promise.resolve({ id: listing.id }) });
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/listings/[id]", () => {
  it("owner can soft-cancel (status → CANCELLED, row preserved)", async () => {
    const { listing, seller } = await seedListing();
    setMockUser(seller.id);
    const res = await DELETE(new Request("http://localhost/x"), { params: Promise.resolve({ id: listing.id }) });
    expect(res.status).toBe(200);
    const reloaded = await prisma.listing.findUnique({ where: { id: listing.id } });
    expect(reloaded).not.toBeNull(); // soft delete — row still exists
    expect(reloaded?.status).toBe("CANCELLED");
  });

  it("403 when caller is not the seller", async () => {
    const { listing } = await seedListing();
    const stranger = await prisma.user.create({ data: { email: "x@x.com", username: "stranger" } });
    setMockUser(stranger.id);
    const res = await DELETE(new Request("http://localhost/x"), { params: Promise.resolve({ id: listing.id }) });
    expect(res.status).toBe(403);
  });

  it("404 when listing does not exist", async () => {
    const seller = await prisma.user.create({ data: { email: "s@x.com", username: "seller" } });
    setMockUser(seller.id);
    const res = await DELETE(new Request("http://localhost/x"), { params: Promise.resolve({ id: "ckxxxxxxxxxxxxxxxxxxxxxxx" }) });
    expect(res.status).toBe(404);
  });
});

describe("GET /api/listings/[id]", () => {
  it("anyone can GET (public endpoint)", async () => {
    const { listing } = await seedListing();
    const res = await GET(new Request("http://localhost/x"), { params: Promise.resolve({ id: listing.id }) });
    expect(res.status).toBe(200);
  });

  it("404 when missing", async () => {
    const res = await GET(new Request("http://localhost/x"), { params: Promise.resolve({ id: "ckxxxxxxxxxxxxxxxxxxxxxxx" }) });
    expect(res.status).toBe(404);
  });
});
