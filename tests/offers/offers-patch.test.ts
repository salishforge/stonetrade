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

let PATCH: typeof import("@/app/api/offers/[id]/route").PATCH;

beforeAll(async () => {
  ({ PATCH } = await import("@/app/api/offers/[id]/route"));
});

beforeEach(async () => {
  await resetDatabase();
  setMockUser(null);
});

async function seedOffer(status: "PENDING" | "ACCEPTED" | "DECLINED" | "WITHDRAWN" | "COUNTERED" | "EXPIRED" = "PENDING") {
  const game = await prisma.game.create({ data: { name: "W", slug: "w", publisher: "S", website: "https://e.com" } });
  const set = await prisma.set.create({ data: { gameId: game.id, name: "Set", code: "S", totalCards: 1 } });
  const card = await prisma.card.create({ data: { gameId: game.id, setId: set.id, cardNumber: "001", name: "C", rarity: "Common", cardType: "Unit", treatment: "Classic Paper" } });
  const seller = await prisma.user.create({ data: { email: "s@x.com", username: "seller" } });
  const buyer = await prisma.user.create({ data: { email: "b@x.com", username: "buyer" } });
  const listing = await prisma.listing.create({ data: { sellerId: seller.id, cardId: card.id, price: "10.00", condition: "NEAR_MINT", treatment: "Classic Paper", type: "SINGLE", quantity: 1, quantitySold: 0, shippingOptions: [], status: "ACTIVE", allowOffers: true } });
  const offer = await prisma.offer.create({
    data: { listingId: listing.id, buyerId: buyer.id, amount: "8.00", status, expiresAt: new Date(Date.now() + 86400000) },
  });
  return { offer, buyer, seller, listing };
}

function patchReq(body: object): NextRequest {
  return new NextRequest(new URL("http://localhost/x"), {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/offers/[id]", () => {
  it("seller can ACCEPT a pending offer; respondedAt set", async () => {
    const { offer, seller } = await seedOffer();
    setMockUser(seller.id);
    const res = await PATCH(patchReq({ action: "accept" }), { params: Promise.resolve({ id: offer.id }) });
    expect(res.status).toBe(200);
    const reloaded = await prisma.offer.findUnique({ where: { id: offer.id } });
    expect(reloaded?.status).toBe("ACCEPTED");
    expect(reloaded?.respondedAt).not.toBeNull();
  });

  it("seller can DECLINE a pending offer", async () => {
    const { offer, seller } = await seedOffer();
    setMockUser(seller.id);
    const res = await PATCH(patchReq({ action: "decline" }), { params: Promise.resolve({ id: offer.id }) });
    expect(res.status).toBe(200);
    const reloaded = await prisma.offer.findUnique({ where: { id: offer.id } });
    expect(reloaded?.status).toBe("DECLINED");
  });

  it("seller can COUNTER a pending offer; original goes COUNTERED, new offer chains via parentOfferId", async () => {
    const { offer, seller } = await seedOffer();
    setMockUser(seller.id);
    const res = await PATCH(patchReq({ action: "counter", counterAmount: 9.5, message: "How about $9.50?" }), { params: Promise.resolve({ id: offer.id }) });
    expect(res.status).toBe(200);
    const data = (await res.json()).data;

    const reloaded = await prisma.offer.findUnique({ where: { id: offer.id } });
    expect(reloaded?.status).toBe("COUNTERED");

    const counter = await prisma.offer.findUnique({ where: { id: data.counterId } });
    expect(counter).not.toBeNull();
    expect(Number(counter?.amount)).toBe(9.5);
    expect(counter?.parentOfferId).toBe(offer.id);
    expect(counter?.message).toBe("How about $9.50?");
    expect(counter?.status).toBe("PENDING");
  });

  it("buyer can WITHDRAW a pending offer", async () => {
    const { offer, buyer } = await seedOffer();
    setMockUser(buyer.id);
    const res = await PATCH(patchReq({ action: "withdraw" }), { params: Promise.resolve({ id: offer.id }) });
    expect(res.status).toBe(200);
    const reloaded = await prisma.offer.findUnique({ where: { id: offer.id } });
    expect(reloaded?.status).toBe("WITHDRAWN");
  });

  it("buyer cannot ACCEPT (seller-only)", async () => {
    const { offer, buyer } = await seedOffer();
    setMockUser(buyer.id);
    const res = await PATCH(patchReq({ action: "accept" }), { params: Promise.resolve({ id: offer.id }) });
    expect(res.status).toBe(403);
  });

  it("seller cannot WITHDRAW (buyer-only)", async () => {
    const { offer, seller } = await seedOffer();
    setMockUser(seller.id);
    const res = await PATCH(patchReq({ action: "withdraw" }), { params: Promise.resolve({ id: offer.id }) });
    expect(res.status).toBe(403);
  });

  it("counter without counterAmount is rejected", async () => {
    const { offer, seller } = await seedOffer();
    setMockUser(seller.id);
    // The route has a guard `if (action === "counter" && isSeller && counterAmount)`. Without
    // counterAmount, the route falls through to the 403 catch-all.
    const res = await PATCH(patchReq({ action: "counter" }), { params: Promise.resolve({ id: offer.id }) });
    expect([400, 403]).toContain(res.status);
  });

  it("404 when offer is not pending (e.g. already accepted)", async () => {
    const { offer, seller } = await seedOffer("ACCEPTED");
    setMockUser(seller.id);
    const res = await PATCH(patchReq({ action: "decline" }), { params: Promise.resolve({ id: offer.id }) });
    expect(res.status).toBe(404);
  });

  it("400 on invalid action", async () => {
    const { offer, seller } = await seedOffer();
    setMockUser(seller.id);
    const res = await PATCH(patchReq({ action: "explode" }), { params: Promise.resolve({ id: offer.id }) });
    expect(res.status).toBe(400);
  });
});
