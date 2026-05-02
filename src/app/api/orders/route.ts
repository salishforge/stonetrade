import { NextRequest, NextResponse } from "next/server";
import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { createOrderSchema } from "@/lib/validators/order";
import { PLATFORM_FEE_PERCENT } from "@/lib/stripe";

export async function GET(request: NextRequest) {
  const user = await requireUser();
  const searchParams = request.nextUrl.searchParams;
  const role = searchParams.get("role") ?? "buyer";

  const where = role === "seller"
    ? { sellerId: user.id }
    : { buyerId: user.id };

  const orders = await prisma.order.findMany({
    where,
    include: {
      listing: {
        include: {
          card: { select: { name: true, cardNumber: true, treatment: true, imageUrl: true, orbital: true, rarity: true } },
        },
      },
      buyer: { select: { username: true } },
      seller: { select: { username: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ data: orders });
}

/**
 * HTTP errors thrown from inside the order-creation transaction. Caught at
 * the route boundary and serialised to a JSON response with the right
 * status. Throwing aborts the transaction; returning early would commit a
 * partial state.
 */
class OrderCreationError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function POST(request: NextRequest) {
  const user = await requireUser();
  const body = await request.json();
  const parsed = createOrderSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.issues }, { status: 400 });
  }

  const input = parsed.data;

  try {
    const order = await prisma.$transaction(async (tx) => {
      // SELECT … FOR UPDATE serialises concurrent order creations against the
      // same listing. The lock is held for the rest of the tx, so when two
      // buyers race for `quantity=1`, the second one sees the first's
      // outstanding PENDING_PAYMENT order and bounces with 409 instead of
      // both proceeding to checkout (and one of them eating a Stripe refund).
      const listingRows = await tx.$queryRaw<
        {
          id: string;
          status: string;
          sellerId: string;
          quantity: number;
          quantitySold: number;
          price: string;
          shippingOptions: unknown;
        }[]
      >`SELECT id, status::text AS status, "sellerId", quantity, "quantitySold",
              price::text AS price, "shippingOptions"
         FROM "Listing"
         WHERE id = ${input.listingId}
         FOR UPDATE`;

      const listing = listingRows[0];
      if (!listing || listing.status !== "ACTIVE") {
        throw new OrderCreationError(404, "Listing not available");
      }
      if (listing.sellerId === user.id) {
        throw new OrderCreationError(400, "Cannot buy your own listing");
      }

      // Resolve unit price + quantity. Default both come from the listing.
      // If the buyer redeems an accepted offer, force quantity=1 (offers are
      // per-unit) and use the negotiated amount instead of listing.price.
      let unitPrice = new Decimal(listing.price);
      let orderQuantity = input.quantity;
      let acceptedOfferId: string | null = null;

      if (input.offerId) {
        const offer = await tx.offer.findUnique({ where: { id: input.offerId } });
        if (!offer) throw new OrderCreationError(404, "Offer not found");
        if (offer.buyerId !== user.id) throw new OrderCreationError(403, "Offer does not belong to you");
        if (offer.listingId !== listing.id) throw new OrderCreationError(400, "Offer is for a different listing");
        if (offer.status !== "ACCEPTED") throw new OrderCreationError(409, "Offer is not in an accepted state");

        // Each accepted offer can produce only one order (Order.acceptedOfferId is unique).
        const existing = await tx.order.findUnique({ where: { acceptedOfferId: offer.id } });
        if (existing) throw new OrderCreationError(409, "Offer has already been redeemed");

        unitPrice = new Decimal(offer.amount.toString());
        orderQuantity = 1;
        acceptedOfferId = offer.id;
      }

      // True availability accounts for both confirmed sales (quantitySold)
      // AND unpaid orders that are still holding a slot (PENDING_PAYMENT).
      // The FOR UPDATE lock above prevents another buyer's PENDING_PAYMENT
      // order from sneaking in between this aggregate and our insert.
      const reserved = await tx.order.aggregate({
        where: { listingId: listing.id, status: "PENDING_PAYMENT" },
        _sum: { quantity: true },
      });
      const reservedQty = reserved._sum.quantity ?? 0;
      const trueAvailable = listing.quantity - listing.quantitySold - reservedQty;
      if (orderQuantity > trueAvailable) {
        throw new OrderCreationError(409, `Only ${trueAvailable} available right now`);
      }

      // Snapshot the chosen shipping method against the listing's CURRENT
      // shippingOptions JSON. The seller can change this JSON at any time;
      // we snapshot here so the price the buyer pays at checkout matches
      // the price the buyer agreed to at order creation. Reject (don't
      // default to $0) when the method isn't on the current list — that
      // attack pattern would let a seller drop shipping to free.
      const shippingOptions = (listing.shippingOptions ?? []) as Array<{ method: string; price: number | string }>;
      const shippingOption = Array.isArray(shippingOptions)
        ? shippingOptions.find((o) => o.method === input.shippingMethod)
        : undefined;
      if (!shippingOption) {
        throw new OrderCreationError(400, `Shipping method "${input.shippingMethod}" not offered for this listing`);
      }
      const shippingDec = new Decimal(shippingOption.price.toString());

      // Decimal arithmetic for prices — never Number(). Round to 2dp at the
      // edges (shipping/subtotal/fee) so the values written to the DB match
      // the Decimal(10,2) column shape exactly.
      const subtotal = unitPrice.times(orderQuantity).toDecimalPlaces(2);
      const platformFee = subtotal
        .times(PLATFORM_FEE_PERCENT)
        .dividedBy(100)
        .toDecimalPlaces(2);
      const total = subtotal.plus(shippingDec).toDecimalPlaces(2);

      return tx.order.create({
        data: {
          listingId: listing.id,
          buyerId: user.id,
          sellerId: listing.sellerId,
          quantity: orderQuantity,
          subtotal: subtotal.toString(),
          shipping: shippingDec.toString(),
          platformFee: platformFee.toString(),
          total: total.toString(),
          shippingMethod: input.shippingMethod,
          shippingAddress: input.shippingAddress,
          status: "PENDING_PAYMENT",
          acceptedOfferId,
        },
      });
    });

    return NextResponse.json({ data: order }, { status: 201 });
  } catch (err) {
    if (err instanceof OrderCreationError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
