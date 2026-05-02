import { describe, it, expect, beforeEach, beforeAll, vi } from "vitest";
import { NextRequest } from "next/server";
import type Stripe from "stripe";
import { resetDatabase, prisma } from "../db";

// Stripe SDK is a third-party API; mock its constructEvent and accounts/sessions getters
// rather than running real network calls. This is the boundary that doctrine permits
// mocking. Webhook signature handling is logic in our route, not the SDK; we still
// exercise the full handler.
const constructEventMock = vi.fn();
const refundsCreateMock = vi.fn();

vi.mock("@/lib/stripe", () => ({
  PLATFORM_FEE_PERCENT: 5,
  getStripe: () => ({
    webhooks: { constructEvent: constructEventMock },
    refunds: { create: refundsCreateMock },
  }),
}));

// Resend is also third-party. Stub the email send so the webhook doesn't try to talk
// to Resend during tests. We assert that the webhook still completes its DB work
// even when email is a no-op.
vi.mock("@/lib/email/resend", () => ({
  sendEmail: vi.fn().mockResolvedValue(null),
}));

let POST: typeof import("@/app/api/stripe/webhook/route").POST;

beforeAll(async () => {
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_for_unit_tests";
  ({ POST } = await import("@/app/api/stripe/webhook/route"));
});

beforeEach(async () => {
  await resetDatabase();
  constructEventMock.mockReset();
  refundsCreateMock.mockReset();
  refundsCreateMock.mockResolvedValue({ id: "re_test" });
});

async function seedOrder(opts: { sessionId: string; status: "PENDING_PAYMENT" | "PAID" }) {
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
    data: { email: "seller@example.com", username: "seller", stripeAccountId: "acct_test" },
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
      quantity: 5,
      quantitySold: 0,
      shippingOptions: [],
      status: "ACTIVE",
    },
  });
  const order = await prisma.order.create({
    data: {
      listingId: listing.id,
      buyerId: buyer.id,
      sellerId: seller.id,
      quantity: 2,
      subtotal: "20.00",
      shipping: "0.00",
      platformFee: "1.00",
      total: "20.00",
      shippingMethod: "standard",
      shippingAddress: { line1: "123 Main", city: "Seattle", country: "US" },
      status: opts.status,
      stripeCheckoutSessionId: opts.sessionId,
      paidAt: opts.status === "PAID" ? new Date() : null,
    },
  });
  return { listing, order, buyer, seller, card };
}

function makePostRequest(body: string, signature: string | null): NextRequest {
  const headers = new Headers();
  if (signature !== null) headers.set("stripe-signature", signature);
  return new NextRequest(new URL("http://localhost/api/stripe/webhook"), {
    method: "POST",
    headers,
    body,
  });
}

describe("POST /api/stripe/webhook", () => {
  it("rejects requests without a signature header", async () => {
    const res = await POST(makePostRequest("{}", null));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Missing stripe-signature header" });
    expect(constructEventMock).not.toHaveBeenCalled();
  });

  it("rejects requests with an invalid signature", async () => {
    constructEventMock.mockImplementation(() => {
      throw new Error("Signature mismatch");
    });
    const res = await POST(makePostRequest("{}", "t=1,v1=invalid"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid signature" });
  });

  it("on checkout.session.completed: marks order PAID, increments listing, creates PriceDataPoint", async () => {
    const { order, listing } = await seedOrder({ sessionId: "cs_test_a", status: "PENDING_PAYMENT" });

    constructEventMock.mockReturnValue({
      id: "evt_1",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_a",
          payment_intent: "pi_test_a",
        } as unknown as Stripe.Checkout.Session,
      },
    } as unknown as Stripe.Event);

    const res = await POST(makePostRequest("raw", "t=1,v1=ok"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });

    const reloaded = await prisma.order.findUnique({ where: { id: order.id } });
    expect(reloaded?.status).toBe("PAID");
    expect(reloaded?.paidAt).not.toBeNull();
    expect(reloaded?.stripePaymentIntentId).toBe("pi_test_a");

    const reloadedListing = await prisma.listing.findUnique({ where: { id: listing.id } });
    expect(reloadedListing?.quantitySold).toBe(2);
    expect(reloadedListing?.status).toBe("ACTIVE");

    const dataPoints = await prisma.priceDataPoint.findMany({ where: { listingId: listing.id } });
    expect(dataPoints).toHaveLength(1);
    expect(dataPoints[0].source).toBe("COMPLETED_SALE");
    expect(dataPoints[0].verified).toBe(true);

    // Recompute trigger: CardMarketValue should now exist for the listing's card,
    // populated by the post-PAID recalculate call.
    const marketValue = await prisma.cardMarketValue.findUnique({ where: { cardId: listing.cardId! } });
    expect(marketValue).not.toBeNull();
    expect(marketValue?.totalSales).toBeGreaterThanOrEqual(1);
  });

  it("transitions Listing to SOLD when stock is exhausted by the order quantity", async () => {
    const { order, listing } = await seedOrder({ sessionId: "cs_test_b", status: "PENDING_PAYMENT" });
    await prisma.listing.update({
      where: { id: listing.id },
      data: { quantity: 2, quantitySold: 0 },
    });

    constructEventMock.mockReturnValue({
      id: "evt_2",
      type: "checkout.session.completed",
      data: { object: { id: "cs_test_b", payment_intent: "pi_b" } as unknown as Stripe.Checkout.Session },
    } as unknown as Stripe.Event);

    await POST(makePostRequest("raw", "t=1,v1=ok"));

    const reloadedListing = await prisma.listing.findUnique({ where: { id: listing.id } });
    expect(reloadedListing?.quantitySold).toBe(2);
    expect(reloadedListing?.status).toBe("SOLD");

    const reloadedOrder = await prisma.order.findUnique({ where: { id: order.id } });
    expect(reloadedOrder?.status).toBe("PAID");
  });

  it("is idempotent: replaying the event on an already-PAID order makes no changes", async () => {
    const { order, listing } = await seedOrder({ sessionId: "cs_test_c", status: "PAID" });
    const originalQuantitySold = listing.quantitySold;

    constructEventMock.mockReturnValue({
      id: "evt_3",
      type: "checkout.session.completed",
      data: { object: { id: "cs_test_c", payment_intent: "pi_c" } as unknown as Stripe.Checkout.Session },
    } as unknown as Stripe.Event);

    const res = await POST(makePostRequest("raw", "t=1,v1=ok"));
    expect(res.status).toBe(200);

    const reloadedListing = await prisma.listing.findUnique({ where: { id: listing.id } });
    expect(reloadedListing?.quantitySold).toBe(originalQuantitySold);

    const dataPoints = await prisma.priceDataPoint.findMany({ where: { listingId: listing.id } });
    expect(dataPoints).toHaveLength(0);

    const reloadedOrder = await prisma.order.findUnique({ where: { id: order.id } });
    expect(reloadedOrder?.id).toBe(order.id);
  });

  it("acknowledges unhandled event types with 200", async () => {
    constructEventMock.mockReturnValue({
      id: "evt_4",
      type: "customer.subscription.updated",
      data: { object: {} as unknown as Stripe.Customer },
    } as unknown as Stripe.Event);

    const res = await POST(makePostRequest("raw", "t=1,v1=ok"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it("oversell: cancels order and issues refund when stock is insufficient at payment time", async () => {
    const { order, listing } = await seedOrder({ sessionId: "cs_oversell", status: "PENDING_PAYMENT" });
    // Order wants 2 units. Simulate concurrent orders draining the listing
    // while this order's checkout session was open.
    await prisma.listing.update({
      where: { id: listing.id },
      data: { quantitySold: 4 }, // listing.quantity=5, only 1 left, order wants 2
    });

    constructEventMock.mockReturnValue({
      id: "evt_oversell",
      type: "checkout.session.completed",
      data: { object: { id: "cs_oversell", payment_intent: "pi_oversell" } as unknown as Stripe.Checkout.Session },
    } as unknown as Stripe.Event);

    const res = await POST(makePostRequest("raw", "t=1,v1=ok"));
    expect(res.status).toBe(200);

    const reloadedOrder = await prisma.order.findUnique({ where: { id: order.id } });
    expect(reloadedOrder?.status).toBe("CANCELLED");
    expect(reloadedOrder?.stripePaymentIntentId).toBe("pi_oversell");
    expect(reloadedOrder?.paidAt).toBeNull();

    const reloadedListing = await prisma.listing.findUnique({ where: { id: listing.id } });
    expect(reloadedListing?.quantitySold).toBe(4); // unchanged

    const dataPoints = await prisma.priceDataPoint.findMany({ where: { listingId: listing.id } });
    expect(dataPoints).toHaveLength(0);

    expect(refundsCreateMock).toHaveBeenCalledOnce();
    // Hardening pass: refund is now created with a stable idempotency key
    // derived from the payment_intent so a re-delivered webhook can't
    // double-refund. The Stripe SDK accepts this as a 2nd argument.
    expect(refundsCreateMock).toHaveBeenCalledWith(
      {
        payment_intent: "pi_oversell",
        reason: "requested_by_customer",
      },
      { idempotencyKey: "oversold-refund:pi_oversell" },
    );
  });

  it("idempotency on CANCELLED: replaying the event does not re-refund", async () => {
    const { order, listing } = await seedOrder({ sessionId: "cs_already_cancelled", status: "PENDING_PAYMENT" });
    await prisma.order.update({
      where: { id: order.id },
      data: { status: "CANCELLED", stripePaymentIntentId: "pi_already" },
    });

    constructEventMock.mockReturnValue({
      id: "evt_replay",
      type: "checkout.session.completed",
      data: { object: { id: "cs_already_cancelled", payment_intent: "pi_already" } as unknown as Stripe.Checkout.Session },
    } as unknown as Stripe.Event);

    const res = await POST(makePostRequest("raw", "t=1,v1=ok"));
    expect(res.status).toBe(200);

    const reloadedListing = await prisma.listing.findUnique({ where: { id: listing.id } });
    expect(reloadedListing?.quantitySold).toBe(0); // never touched
    expect(refundsCreateMock).not.toHaveBeenCalled();
  });

  describe("charge.dispute.created", () => {
    it("marks PAID order as DISPUTED", async () => {
      const { order } = await seedOrder({ sessionId: "cs_disputed", status: "PAID" });
      await prisma.order.update({
        where: { id: order.id },
        data: { stripePaymentIntentId: "pi_disputed" },
      });

      constructEventMock.mockReturnValue({
        id: "evt_dispute",
        type: "charge.dispute.created",
        data: {
          object: { id: "dp_test", payment_intent: "pi_disputed" } as unknown as Stripe.Dispute,
        },
      } as unknown as Stripe.Event);

      const res = await POST(makePostRequest("raw", "t=1,v1=ok"));
      expect(res.status).toBe(200);

      const reloaded = await prisma.order.findUnique({ where: { id: order.id } });
      expect(reloaded?.status).toBe("DISPUTED");
    });

    it("idempotent: dispute event on already-DISPUTED order is no-op", async () => {
      const { order } = await seedOrder({ sessionId: "cs_already_disputed", status: "PAID" });
      await prisma.order.update({
        where: { id: order.id },
        data: { stripePaymentIntentId: "pi_idem", status: "DISPUTED" },
      });

      constructEventMock.mockReturnValue({
        id: "evt_dispute_replay",
        type: "charge.dispute.created",
        data: { object: { id: "dp_test", payment_intent: "pi_idem" } as unknown as Stripe.Dispute },
      } as unknown as Stripe.Event);

      const res = await POST(makePostRequest("raw", "t=1,v1=ok"));
      expect(res.status).toBe(200);

      const reloaded = await prisma.order.findUnique({ where: { id: order.id } });
      expect(reloaded?.status).toBe("DISPUTED"); // unchanged
    });

    it("does not flip an already-REFUNDED order to DISPUTED", async () => {
      const { order } = await seedOrder({ sessionId: "cs_refunded_then_dispute", status: "PAID" });
      await prisma.order.update({
        where: { id: order.id },
        data: { stripePaymentIntentId: "pi_ref", status: "REFUNDED" },
      });

      constructEventMock.mockReturnValue({
        id: "evt_dispute_after_refund",
        type: "charge.dispute.created",
        data: { object: { id: "dp_test", payment_intent: "pi_ref" } as unknown as Stripe.Dispute },
      } as unknown as Stripe.Event);

      const res = await POST(makePostRequest("raw", "t=1,v1=ok"));
      expect(res.status).toBe(200);

      const reloaded = await prisma.order.findUnique({ where: { id: order.id } });
      expect(reloaded?.status).toBe("REFUNDED"); // unchanged
    });

    it("returns 200 when no order matches the disputed payment intent", async () => {
      constructEventMock.mockReturnValue({
        id: "evt_dispute_no_match",
        type: "charge.dispute.created",
        data: { object: { id: "dp_x", payment_intent: "pi_does_not_exist" } as unknown as Stripe.Dispute },
      } as unknown as Stripe.Event);
      const res = await POST(makePostRequest("raw", "t=1,v1=ok"));
      expect(res.status).toBe(200);
    });
  });

  describe("charge.refunded", () => {
    it("marks PAID order as REFUNDED", async () => {
      const { order } = await seedOrder({ sessionId: "cs_to_refund", status: "PAID" });
      await prisma.order.update({
        where: { id: order.id },
        data: { stripePaymentIntentId: "pi_refunded" },
      });

      constructEventMock.mockReturnValue({
        id: "evt_refund",
        type: "charge.refunded",
        data: { object: { id: "ch_x", payment_intent: "pi_refunded" } as unknown as Stripe.Charge },
      } as unknown as Stripe.Event);

      const res = await POST(makePostRequest("raw", "t=1,v1=ok"));
      expect(res.status).toBe(200);

      const reloaded = await prisma.order.findUnique({ where: { id: order.id } });
      expect(reloaded?.status).toBe("REFUNDED");
    });

    it("does NOT clobber a CANCELLED order (oversell self-refund path)", async () => {
      // Simulating: our oversell path marked the order CANCELLED + initiated a
      // refund. Stripe sends charge.refunded back to us. We must leave the
      // CANCELLED label intact rather than overwriting with REFUNDED.
      const { order } = await seedOrder({ sessionId: "cs_oversell_refund", status: "PENDING_PAYMENT" });
      await prisma.order.update({
        where: { id: order.id },
        data: { stripePaymentIntentId: "pi_self_refund", status: "CANCELLED" },
      });

      constructEventMock.mockReturnValue({
        id: "evt_self_refund",
        type: "charge.refunded",
        data: { object: { id: "ch_x", payment_intent: "pi_self_refund" } as unknown as Stripe.Charge },
      } as unknown as Stripe.Event);

      const res = await POST(makePostRequest("raw", "t=1,v1=ok"));
      expect(res.status).toBe(200);

      const reloaded = await prisma.order.findUnique({ where: { id: order.id } });
      expect(reloaded?.status).toBe("CANCELLED"); // preserved
    });

    it("idempotent: refund event on already-REFUNDED order is no-op", async () => {
      const { order } = await seedOrder({ sessionId: "cs_refund_replay", status: "PAID" });
      await prisma.order.update({
        where: { id: order.id },
        data: { stripePaymentIntentId: "pi_replay", status: "REFUNDED" },
      });

      constructEventMock.mockReturnValue({
        id: "evt_refund_replay",
        type: "charge.refunded",
        data: { object: { id: "ch_y", payment_intent: "pi_replay" } as unknown as Stripe.Charge },
      } as unknown as Stripe.Event);

      const res = await POST(makePostRequest("raw", "t=1,v1=ok"));
      expect(res.status).toBe(200);

      const reloaded = await prisma.order.findUnique({ where: { id: order.id } });
      expect(reloaded?.status).toBe("REFUNDED");
    });
  });

  describe("account.updated", () => {
    it("flips stripeOnboardingComplete=true when both charges + payouts enabled", async () => {
      const seller = await prisma.user.create({
        data: { email: "s@x.com", username: "s1", stripeAccountId: "acct_seller" },
      });
      expect(seller.stripeOnboardingComplete).toBe(false);

      constructEventMock.mockReturnValue({
        id: "evt_acct_ok",
        type: "account.updated",
        data: { object: { id: "acct_seller", charges_enabled: true, payouts_enabled: true } as unknown as Stripe.Account },
      } as unknown as Stripe.Event);

      const res = await POST(makePostRequest("raw", "t=1,v1=ok"));
      expect(res.status).toBe(200);

      const reloaded = await prisma.user.findUnique({ where: { id: seller.id } });
      expect(reloaded?.stripeOnboardingComplete).toBe(true);
    });

    it("flips stripeOnboardingComplete=false when payouts get disabled", async () => {
      const seller = await prisma.user.create({
        data: { email: "s@x.com", username: "s1", stripeAccountId: "acct_seller", stripeOnboardingComplete: true },
      });

      constructEventMock.mockReturnValue({
        id: "evt_acct_off",
        type: "account.updated",
        data: { object: { id: "acct_seller", charges_enabled: true, payouts_enabled: false } as unknown as Stripe.Account },
      } as unknown as Stripe.Event);

      const res = await POST(makePostRequest("raw", "t=1,v1=ok"));
      expect(res.status).toBe(200);

      const reloaded = await prisma.user.findUnique({ where: { id: seller.id } });
      expect(reloaded?.stripeOnboardingComplete).toBe(false);
    });

    it("ignores account.updated for an unknown stripeAccountId", async () => {
      constructEventMock.mockReturnValue({
        id: "evt_acct_unknown",
        type: "account.updated",
        data: { object: { id: "acct_orphan", charges_enabled: true, payouts_enabled: true } as unknown as Stripe.Account },
      } as unknown as Stripe.Event);

      const res = await POST(makePostRequest("raw", "t=1,v1=ok"));
      expect(res.status).toBe(200);
    });
  });

  describe("payment_intent.payment_failed", () => {
    it("marks PENDING_PAYMENT order as CANCELLED", async () => {
      const { order } = await seedOrder({ sessionId: "cs_pi_fail", status: "PENDING_PAYMENT" });
      await prisma.order.update({
        where: { id: order.id },
        data: { stripePaymentIntentId: "pi_fail" },
      });

      constructEventMock.mockReturnValue({
        id: "evt_pi_fail",
        type: "payment_intent.payment_failed",
        data: { object: { id: "pi_fail" } as unknown as Stripe.PaymentIntent },
      } as unknown as Stripe.Event);

      const res = await POST(makePostRequest("raw", "t=1,v1=ok"));
      expect(res.status).toBe(200);

      const reloaded = await prisma.order.findUnique({ where: { id: order.id } });
      expect(reloaded?.status).toBe("CANCELLED");
    });

    it("does not touch a PAID order if a stale payment_failed event arrives", async () => {
      const { order } = await seedOrder({ sessionId: "cs_already_paid", status: "PAID" });
      await prisma.order.update({
        where: { id: order.id },
        data: { stripePaymentIntentId: "pi_done" },
      });

      constructEventMock.mockReturnValue({
        id: "evt_pi_late",
        type: "payment_intent.payment_failed",
        data: { object: { id: "pi_done" } as unknown as Stripe.PaymentIntent },
      } as unknown as Stripe.Event);

      const res = await POST(makePostRequest("raw", "t=1,v1=ok"));
      expect(res.status).toBe(200);

      const reloaded = await prisma.order.findUnique({ where: { id: order.id } });
      expect(reloaded?.status).toBe("PAID"); // unchanged
    });
  });

  it("returns 200 (acknowledges) when the session id matches no order", async () => {
    constructEventMock.mockReturnValue({
      id: "evt_5",
      type: "checkout.session.completed",
      data: {
        object: { id: "cs_does_not_exist", payment_intent: null } as unknown as Stripe.Checkout.Session,
      },
    } as unknown as Stripe.Event);

    const res = await POST(makePostRequest("raw", "t=1,v1=ok"));
    expect(res.status).toBe(200);
  });
});
