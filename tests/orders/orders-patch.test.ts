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

let GET: typeof import("@/app/api/orders/[id]/route").GET;
let PATCH: typeof import("@/app/api/orders/[id]/route").PATCH;

beforeAll(async () => {
  ({ GET, PATCH } = await import("@/app/api/orders/[id]/route"));
});

beforeEach(async () => {
  await resetDatabase();
  setMockUser(null);
});

async function seedOrder(status: "PAID" | "SHIPPED" | "DELIVERED" | "PENDING_PAYMENT") {
  const game = await prisma.game.create({ data: { name: "W", slug: "w", publisher: "S", website: "https://e.com" } });
  const set = await prisma.set.create({ data: { gameId: game.id, name: "Set", code: "S", totalCards: 1 } });
  const card = await prisma.card.create({ data: { gameId: game.id, setId: set.id, cardNumber: "001", name: "C", rarity: "Common", cardType: "Unit", treatment: "Classic Paper" } });
  const seller = await prisma.user.create({ data: { email: "s@x.com", username: "seller" } });
  const buyer = await prisma.user.create({ data: { email: "b@x.com", username: "buyer" } });
  const listing = await prisma.listing.create({ data: { sellerId: seller.id, cardId: card.id, price: "10.00", condition: "NEAR_MINT", treatment: "Classic Paper", type: "SINGLE", quantity: 1, quantitySold: 0, shippingOptions: [], status: "ACTIVE" } });
  const order = await prisma.order.create({
    data: {
      listingId: listing.id, buyerId: buyer.id, sellerId: seller.id, quantity: 1,
      subtotal: "10.00", shipping: "0.00", platformFee: "0.50", total: "10.00",
      shippingMethod: "standard", shippingAddress: { line1: "x" },
      status, paidAt: status !== "PENDING_PAYMENT" ? new Date() : null,
    },
  });
  return { order, buyer, seller, listing };
}

function patchReq(body: object): NextRequest {
  return new NextRequest(new URL("http://localhost/x"), {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/orders/[id]", () => {
  it("seller can transition PAID → SHIPPED with tracking number, sets shippedAt", async () => {
    const { order, seller } = await seedOrder("PAID");
    setMockUser(seller.id);
    const res = await PATCH(patchReq({ status: "SHIPPED", trackingNumber: "TRK123" }), { params: Promise.resolve({ id: order.id }) });
    expect(res.status).toBe(200);
    const data = (await res.json()).data;
    expect(data.status).toBe("SHIPPED");
    expect(data.trackingNumber).toBe("TRK123");
    expect(data.shippedAt).not.toBeNull();
  });

  it("buyer cannot transition PAID → SHIPPED (only seller may)", async () => {
    const { order, buyer } = await seedOrder("PAID");
    setMockUser(buyer.id);
    const res = await PATCH(patchReq({ status: "SHIPPED" }), { params: Promise.resolve({ id: order.id }) });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/invalid status transition/i);
  });

  it("buyer can transition SHIPPED → DELIVERED, sets deliveredAt", async () => {
    const { order, buyer } = await seedOrder("SHIPPED");
    setMockUser(buyer.id);
    const res = await PATCH(patchReq({ status: "DELIVERED" }), { params: Promise.resolve({ id: order.id }) });
    expect(res.status).toBe(200);
    const data = (await res.json()).data;
    expect(data.status).toBe("DELIVERED");
    expect(data.deliveredAt).not.toBeNull();
  });

  it("buyer can transition DELIVERED → COMPLETED, sets completedAt", async () => {
    const { order, buyer } = await seedOrder("DELIVERED");
    setMockUser(buyer.id);
    const res = await PATCH(patchReq({ status: "COMPLETED" }), { params: Promise.resolve({ id: order.id }) });
    expect(res.status).toBe(200);
    const data = (await res.json()).data;
    expect(data.status).toBe("COMPLETED");
    expect(data.completedAt).not.toBeNull();
  });

  it("rejects illegal transition (PAID → DELIVERED)", async () => {
    const { order, buyer } = await seedOrder("PAID");
    setMockUser(buyer.id);
    const res = await PATCH(patchReq({ status: "DELIVERED" }), { params: Promise.resolve({ id: order.id }) });
    expect(res.status).toBe(400);
  });

  it("seller cannot transition SHIPPED → DELIVERED (buyer-only)", async () => {
    const { order, seller } = await seedOrder("SHIPPED");
    setMockUser(seller.id);
    const res = await PATCH(patchReq({ status: "DELIVERED" }), { params: Promise.resolve({ id: order.id }) });
    expect(res.status).toBe(400);
  });

  it("403 when caller is neither buyer nor seller", async () => {
    const { order } = await seedOrder("PAID");
    const stranger = await prisma.user.create({ data: { email: "x@x.com", username: "stranger" } });
    setMockUser(stranger.id);
    const res = await PATCH(patchReq({ status: "SHIPPED" }), { params: Promise.resolve({ id: order.id }) });
    expect(res.status).toBe(403);
  });

  it("404 when order does not exist", async () => {
    const buyer = await prisma.user.create({ data: { email: "b@x.com", username: "buyer" } });
    setMockUser(buyer.id);
    const res = await PATCH(patchReq({ status: "SHIPPED" }), { params: Promise.resolve({ id: "ckxxxxxxxxxxxxxxxxxxxxxxx" }) });
    expect(res.status).toBe(404);
  });
});

describe("GET /api/orders/[id]", () => {
  it("returns order to its buyer", async () => {
    const { order, buyer } = await seedOrder("PAID");
    setMockUser(buyer.id);
    const res = await GET(new Request("http://localhost/x"), { params: Promise.resolve({ id: order.id }) });
    expect(res.status).toBe(200);
  });

  it("403 when caller is neither buyer nor seller", async () => {
    const { order } = await seedOrder("PAID");
    const stranger = await prisma.user.create({ data: { email: "x@x.com", username: "stranger" } });
    setMockUser(stranger.id);
    const res = await GET(new Request("http://localhost/x"), { params: Promise.resolve({ id: order.id }) });
    expect(res.status).toBe(403);
  });
});
