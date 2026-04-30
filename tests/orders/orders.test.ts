import { describe, it, expect, beforeEach, beforeAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { resetDatabase, prisma } from "../db";

let currentMockUserId: string | null = null;
function setMockUser(id: string | null) {
  currentMockUserId = id;
}
vi.mock("@/lib/auth", () => ({
  requireUser: async () => {
    if (!currentMockUserId) throw new Error("No mock user set");
    const user = await prisma.user.findUnique({ where: { id: currentMockUserId } });
    if (!user) throw new Error("Mock user not found");
    return user;
  },
}));

let POST: typeof import("@/app/api/orders/route").POST;

beforeAll(async () => {
  ({ POST } = await import("@/app/api/orders/route"));
});

beforeEach(async () => {
  await resetDatabase();
  setMockUser(null);
});

async function seed(overrides?: { listingStatus?: "ACTIVE" | "SOLD" | "RESERVED" | "EXPIRED" | "CANCELLED"; listingQuantity?: number; listingQuantitySold?: number; shippingOptions?: Array<{ method: string; price: number }> | null }) {
  const game = await prisma.game.create({
    data: { name: "Wonders", slug: "wotf", publisher: "Salishforge", website: "https://example.com" },
  });
  const set = await prisma.set.create({
    data: { gameId: game.id, name: "Existence", code: "EX1", totalCards: 100 },
  });
  const card = await prisma.card.create({
    data: {
      gameId: game.id,
      setId: set.id,
      cardNumber: "001",
      name: "Test Card",
      rarity: "COMMON",
      cardType: "UNIT",
      treatment: "Classic Paper",
    },
  });
  const seller = await prisma.user.create({
    data: { email: "seller@example.com", username: "seller" },
  });
  const buyer = await prisma.user.create({
    data: { email: "buyer@example.com", username: "buyer" },
  });
  const listing = await prisma.listing.create({
    data: {
      sellerId: seller.id,
      cardId: card.id,
      price: "10.00",
      condition: "NEAR_MINT",
      treatment: "Classic Paper",
      type: "SINGLE",
      quantity: overrides?.listingQuantity ?? 5,
      quantitySold: overrides?.listingQuantitySold ?? 0,
      shippingOptions: overrides?.shippingOptions === undefined ? [{ method: "standard", price: 5 }] : (overrides.shippingOptions ?? []),
      status: overrides?.listingStatus ?? "ACTIVE",
    },
  });
  return { listing, buyer, seller, card };
}

const validBody = (overrides: Partial<{ listingId: string; quantity: number; shippingMethod: string }> = {}) => ({
  listingId: overrides.listingId ?? "",
  quantity: overrides.quantity ?? 2,
  shippingMethod: overrides.shippingMethod ?? "standard",
  shippingAddress: {
    name: "Buyer Name",
    line1: "123 Main",
    city: "Seattle",
    state: "WA",
    zip: "98101",
    country: "US",
  },
});

function makeRequest(body: object): NextRequest {
  return new NextRequest(new URL("http://localhost/api/orders"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/orders", () => {
  it("400 on validation failure (missing listingId)", async () => {
    const { buyer } = await seed();
    setMockUser(buyer.id);

    const res = await POST(makeRequest({ quantity: 1, shippingMethod: "standard", shippingAddress: {} }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
  });

  it("404 when listing is not ACTIVE", async () => {
    const { listing, buyer } = await seed({ listingStatus: "SOLD" });
    setMockUser(buyer.id);

    const res = await POST(makeRequest(validBody({ listingId: listing.id })));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("Listing not available");
  });

  it("400 when buyer is the seller (cannot buy own listing)", async () => {
    const { listing, seller } = await seed();
    setMockUser(seller.id);

    const res = await POST(makeRequest(validBody({ listingId: listing.id })));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/cannot buy your own/i);
  });

  it("400 when requested quantity exceeds available stock", async () => {
    const { listing, buyer } = await seed({ listingQuantity: 5, listingQuantitySold: 4 });
    setMockUser(buyer.id);

    const res = await POST(makeRequest(validBody({ listingId: listing.id, quantity: 2 })));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Only 1 available/);
  });

  it("happy path: creates order with PENDING_PAYMENT, no listing increment, no PriceDataPoint", async () => {
    const { listing, buyer } = await seed();
    setMockUser(buyer.id);

    const res = await POST(makeRequest(validBody({ listingId: listing.id, quantity: 2 })));
    expect(res.status).toBe(201);
    const order = (await res.json()).data;

    expect(order.status).toBe("PENDING_PAYMENT");
    expect(order.paidAt).toBeNull();
    expect(order.quantity).toBe(2);
    expect(order.buyerId).toBe(buyer.id);
    expect(order.sellerId).toBe(listing.sellerId);
    expect(Number(order.subtotal)).toBe(20);
    expect(Number(order.shipping)).toBe(5);

    // Listing must NOT have been incremented (that happens on payment via webhook)
    const reloadedListing = await prisma.listing.findUnique({ where: { id: listing.id } });
    expect(reloadedListing?.quantitySold).toBe(0);
    expect(reloadedListing?.status).toBe("ACTIVE");

    // No PriceDataPoint should be created on order creation
    const dataPoints = await prisma.priceDataPoint.findMany({ where: { listingId: listing.id } });
    expect(dataPoints).toHaveLength(0);
  });

  it("computes platform fee at 5% of subtotal", async () => {
    const { listing, buyer } = await seed();
    setMockUser(buyer.id);

    const res = await POST(makeRequest(validBody({ listingId: listing.id, quantity: 3 })));
    const order = (await res.json()).data;
    // 3 × $10 = $30 → 5% = $1.50
    expect(Number(order.platformFee)).toBe(1.5);
  });

  it("zero shipping when shippingMethod is not present in listing options", async () => {
    const { listing, buyer } = await seed({ shippingOptions: [{ method: "express", price: 12 }] });
    setMockUser(buyer.id);

    const res = await POST(makeRequest(validBody({ listingId: listing.id, shippingMethod: "standard" })));
    const order = (await res.json()).data;
    expect(Number(order.shipping)).toBe(0);
  });

  describe("offer redemption", () => {
    async function seedOffer(opts: { status: "PENDING" | "ACCEPTED" | "DECLINED" | "WITHDRAWN" | "COUNTERED" | "EXPIRED"; amount?: string }) {
      const seed_ = await seed();
      const offer = await prisma.offer.create({
        data: {
          listingId: seed_.listing.id,
          buyerId: seed_.buyer.id,
          amount: opts.amount ?? "7.00", // negotiated price below listing.price=10
          status: opts.status,
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
      return { ...seed_, offer };
    }

    it("happy path: uses offer.amount as unit price and forces quantity=1", async () => {
      const { listing, buyer, offer } = await seedOffer({ status: "ACCEPTED", amount: "7.50" });
      setMockUser(buyer.id);

      const res = await POST(makeRequest({ ...validBody({ listingId: listing.id, quantity: 5 }), offerId: offer.id }));
      expect(res.status).toBe(201);
      const order = (await res.json()).data;

      expect(order.quantity).toBe(1); // offer forces single-unit order
      expect(Number(order.subtotal)).toBe(7.5);
      // platformFee is Decimal(10,2) — 0.375 rounds to 0.38 at storage
      expect(Number(order.platformFee)).toBeCloseTo(0.38, 2);
      expect(order.acceptedOfferId).toBe(offer.id);
    });

    it("404 when offer does not exist", async () => {
      const { listing, buyer } = await seed();
      setMockUser(buyer.id);

      const res = await POST(makeRequest({ ...validBody({ listingId: listing.id }), offerId: "ckxxxxxxxxxxxxxxxxxxxxxxx" }));
      expect(res.status).toBe(404);
      expect((await res.json()).error).toBe("Offer not found");
    });

    it("403 when caller is not the offer's buyer", async () => {
      const { listing, seller, offer } = await seedOffer({ status: "ACCEPTED" });
      const otherBuyer = await prisma.user.create({
        data: { email: "other@example.com", username: "other-buyer" },
      });
      setMockUser(otherBuyer.id);

      const res = await POST(makeRequest({ ...validBody({ listingId: listing.id }), offerId: offer.id }));
      expect(res.status).toBe(403);
      // Sanity check that seller can't redeem either
      setMockUser(seller.id);
      const res2 = await POST(makeRequest({ ...validBody({ listingId: listing.id }), offerId: offer.id }));
      expect([400, 403]).toContain(res2.status); // 400 for self-buy or 403 for offer ownership
    });

    it("400 when offerId references an offer for a different listing", async () => {
      const { offer, buyer } = await seedOffer({ status: "ACCEPTED" });
      // Make a second listing on the same seller
      const otherListing = await prisma.listing.create({
        data: {
          sellerId: offer.buyerId === buyer.id ? (await prisma.offer.findUnique({ where: { id: offer.id }, include: { listing: true } }))!.listing.sellerId : buyer.id,
          price: "20.00",
          condition: "NEAR_MINT",
          treatment: "Classic Paper",
          type: "SINGLE",
          quantity: 5,
          quantitySold: 0,
          shippingOptions: [{ method: "standard", price: 5 }],
          status: "ACTIVE",
        },
      });
      setMockUser(buyer.id);

      const res = await POST(makeRequest({ ...validBody({ listingId: otherListing.id }), offerId: offer.id }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/different listing/);
    });

    it("409 when the offer is not ACCEPTED (still PENDING)", async () => {
      const { listing, buyer, offer } = await seedOffer({ status: "PENDING" });
      setMockUser(buyer.id);

      const res = await POST(makeRequest({ ...validBody({ listingId: listing.id }), offerId: offer.id }));
      expect(res.status).toBe(409);
      expect((await res.json()).error).toMatch(/not in an accepted state/);
    });

    it("409 when the same offer has already been redeemed", async () => {
      const { listing, buyer, offer } = await seedOffer({ status: "ACCEPTED" });
      setMockUser(buyer.id);

      const first = await POST(makeRequest({ ...validBody({ listingId: listing.id }), offerId: offer.id }));
      expect(first.status).toBe(201);

      const second = await POST(makeRequest({ ...validBody({ listingId: listing.id }), offerId: offer.id }));
      expect(second.status).toBe(409);
      expect((await second.json()).error).toMatch(/already been redeemed/);
    });
  });
});
