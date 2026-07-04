import { describe, it, expect, beforeEach, beforeAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { resetDatabase, prisma } from "../db";

const sessionsCreateMock = vi.fn();

vi.mock("@/lib/stripe", () => ({
  PLATFORM_FEE_PERCENT: 5,
  getStripe: () => ({
    checkout: { sessions: { create: sessionsCreateMock } },
  }),
}));

// The mock auth helper returns whichever buyer was last seeded. Tests that
// want to exercise the wrong-buyer path call setMockUser explicitly.
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

let POST: typeof import("@/app/api/stripe/checkout/route").POST;

beforeAll(async () => {
  ({ POST } = await import("@/app/api/stripe/checkout/route"));
});

beforeEach(async () => {
  await resetDatabase();
  sessionsCreateMock.mockReset();
  sessionsCreateMock.mockResolvedValue({ id: "cs_test", url: "https://checkout.stripe.test/cs_test" });
  setMockUser(null);
});

async function seed(overrides?: { listingQuantity?: number; listingQuantitySold?: number; orderQuantity?: number; sellerStripeAccountId?: string | null }) {
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
    data: {
      email: "seller@example.com",
      username: "seller",
      stripeAccountId: overrides?.sellerStripeAccountId === undefined ? "acct_test" : overrides.sellerStripeAccountId,
    },
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
      shippingOptions: [],
      status: "ACTIVE",
    },
  });
  const order = await prisma.order.create({
    data: {
      listingId: listing.id,
      buyerId: buyer.id,
      sellerId: seller.id,
      quantity: overrides?.orderQuantity ?? 2,
      subtotal: "20.00",
      shipping: "0.00",
      platformFee: "1.00",
      total: "20.00",
      shippingMethod: "standard",
      shippingAddress: { line1: "123 Main", city: "Seattle", country: "US" },
      status: "PENDING_PAYMENT",
    },
  });
  return { order, listing, buyer, seller, card };
}

function makeRequest(body: object): NextRequest {
  return new NextRequest(new URL("http://localhost/api/stripe/checkout"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/stripe/checkout", () => {
  it("happy path: creates a Stripe session, persists session id, returns URL", async () => {
    const { order, buyer } = await seed();
    setMockUser(buyer.id);

    const res = await POST(makeRequest({ orderId: order.id }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      data: { url: "https://checkout.stripe.test/cs_test", sessionId: "cs_test" },
    });

    const reloaded = await prisma.order.findUnique({ where: { id: order.id } });
    expect(reloaded?.stripeCheckoutSessionId).toBe("cs_test");
  });

  it("404 when order does not exist", async () => {
    const { buyer } = await seed();
    setMockUser(buyer.id);
    const res = await POST(makeRequest({ orderId: "ckxxxxxxxxxxxxxxxxxxxxxxx" }));
    expect(res.status).toBe(404);
  });

  it("403 when caller is not the buyer", async () => {
    const { order, seller } = await seed();
    setMockUser(seller.id);
    const res = await POST(makeRequest({ orderId: order.id }));
    expect(res.status).toBe(403);
  });

  it("409 when order is not in PENDING_PAYMENT", async () => {
    const { order, buyer } = await seed();
    await prisma.order.update({ where: { id: order.id }, data: { status: "PAID" } });
    setMockUser(buyer.id);
    const res = await POST(makeRequest({ orderId: order.id }));
    expect(res.status).toBe(409);
  });

  it("503 when seller has no stripeAccountId", async () => {
    const { order, buyer } = await seed({ sellerStripeAccountId: null });
    setMockUser(buyer.id);
    const res = await POST(makeRequest({ orderId: order.id }));
    expect(res.status).toBe(503);
    expect(sessionsCreateMock).not.toHaveBeenCalled();
  });

  it("409 + cancels order when listing no longer has enough stock", async () => {
    // Order wants 2 units; listing.quantity=5 but quantitySold=4 leaves only 1 available.
    const { order, buyer, listing } = await seed({ listingQuantitySold: 4, orderQuantity: 2 });
    setMockUser(buyer.id);

    const res = await POST(makeRequest({ orderId: order.id }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/no longer has enough stock/);

    const reloadedOrder = await prisma.order.findUnique({ where: { id: order.id } });
    expect(reloadedOrder?.status).toBe("CANCELLED");

    expect(sessionsCreateMock).not.toHaveBeenCalled();

    const reloadedListing = await prisma.listing.findUnique({ where: { id: listing.id } });
    expect(reloadedListing?.quantitySold).toBe(4);
  });

  it("line items: snapshotted subtotal as a single line, plus shipping when > 0", async () => {
    // Hardening pass: the card line is now a single quantity=1 line with the
    // order's snapshotted subtotal as unit_amount, NOT listing.price ×
    // order.quantity. This prevents a seller from raising the listing price
    // between order create and checkout and having the buyer pay the new
    // price. The product name carries the "×N" suffix when multi-unit so
    // the buyer sees what they're getting.
    //
    // seed sets listing.price=10.00, order.quantity=2, so order.subtotal=20.00.
    const { order, buyer } = await seed();
    await prisma.order.update({ where: { id: order.id }, data: { shipping: "5.00", total: "25.00" } });
    setMockUser(buyer.id);

    await POST(makeRequest({ orderId: order.id }));

    const args = sessionsCreateMock.mock.calls[0][0];
    expect(args.line_items).toHaveLength(2);

    // Card line: $20.00 × 1 (snapshot subtotal, quantity collapsed)
    expect(args.line_items[0].price_data.unit_amount).toBe(2000);
    expect(args.line_items[0].quantity).toBe(1);
    expect(args.line_items[0].price_data.currency).toBe("usd");
    expect(args.line_items[0].price_data.product_data.name).toBe("Test Card ×2");

    // Shipping line: $5.00 × 1
    expect(args.line_items[1].price_data.unit_amount).toBe(500);
    expect(args.line_items[1].quantity).toBe(1);
    expect(args.line_items[1].price_data.product_data.name).toBe("Shipping");
  });

  it("line items: omits shipping line when shipping is 0", async () => {
    const { order, buyer } = await seed();
    setMockUser(buyer.id);

    await POST(makeRequest({ orderId: order.id }));

    const args = sessionsCreateMock.mock.calls[0][0];
    expect(args.line_items).toHaveLength(1);
    // Default seed creates an order with quantity=2; product name carries
    // the multi-unit suffix.
    expect(args.line_items[0].price_data.product_data.name).toBe("Test Card ×2");
  });

  it("description renders set name + treatment + condition joined with bullets", async () => {
    const { order, buyer } = await seed();
    setMockUser(buyer.id);

    await POST(makeRequest({ orderId: order.id }));

    const args = sessionsCreateMock.mock.calls[0][0];
    expect(args.line_items[0].price_data.product_data.description).toBe(
      "Existence • Classic Paper • NEAR_MINT",
    );
  });

  it("Stripe Connect: passes application_fee_amount and transfer destination", async () => {
    const { order, buyer, seller } = await seed();
    setMockUser(buyer.id);

    await POST(makeRequest({ orderId: order.id }));

    const args = sessionsCreateMock.mock.calls[0][0];
    // order.platformFee = 1.00 → 100 cents
    expect(args.payment_intent_data.application_fee_amount).toBe(100);
    expect(args.payment_intent_data.transfer_data.destination).toBe(seller.stripeAccountId);
    expect(args.payment_intent_data.metadata.orderId).toBe(order.id);
    expect(args.metadata.orderId).toBe(order.id);
  });

  it("buyer email is passed to customer_email", async () => {
    const { order, buyer } = await seed();
    setMockUser(buyer.id);

    await POST(makeRequest({ orderId: order.id }));

    const args = sessionsCreateMock.mock.calls[0][0];
    expect(args.customer_email).toBe(buyer.email);
  });

  it("success_url and cancel_url honor NEXT_PUBLIC_APP_URL", async () => {
    const original = process.env.NEXT_PUBLIC_APP_URL;
    process.env.NEXT_PUBLIC_APP_URL = "https://stonetrade.example";
    try {
      const { order, buyer } = await seed();
      setMockUser(buyer.id);

      await POST(makeRequest({ orderId: order.id }));

      const args = sessionsCreateMock.mock.calls[0][0];
      expect(args.success_url).toBe(`https://stonetrade.example/orders/${order.id}?status=success`);
      expect(args.cancel_url).toBe(`https://stonetrade.example/orders/${order.id}?status=cancelled`);
    } finally {
      if (original === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
      else process.env.NEXT_PUBLIC_APP_URL = original;
    }
  });

  it("502 when Stripe returns no URL (does not persist sessionId)", async () => {
    sessionsCreateMock.mockResolvedValueOnce({ id: "cs_no_url", url: null });
    const { order, buyer } = await seed();
    setMockUser(buyer.id);

    const res = await POST(makeRequest({ orderId: order.id }));
    expect(res.status).toBe(502);

    const reloaded = await prisma.order.findUnique({ where: { id: order.id } });
    expect(reloaded?.stripeCheckoutSessionId).toBeNull();
  });
});
