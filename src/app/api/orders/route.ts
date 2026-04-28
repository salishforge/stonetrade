import { NextRequest, NextResponse } from "next/server";
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

export async function POST(request: NextRequest) {
  const user = await requireUser();
  const body = await request.json();
  const parsed = createOrderSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.issues }, { status: 400 });
  }

  const input = parsed.data;

  const listing = await prisma.listing.findUnique({
    where: { id: input.listingId },
    include: { seller: { select: { id: true } } },
  });

  if (!listing || listing.status !== "ACTIVE") {
    return NextResponse.json({ error: "Listing not available" }, { status: 404 });
  }

  if (listing.sellerId === user.id) {
    return NextResponse.json({ error: "Cannot buy your own listing" }, { status: 400 });
  }

  // Resolve unit price + quantity. By default both come from the listing.
  // If the buyer is paying for an accepted offer, force quantity to 1 (offers
  // are per-unit) and use the negotiated amount instead of listing.price.
  let unitPrice = Number(listing.price);
  let orderQuantity = input.quantity;
  let acceptedOfferId: string | null = null;

  if (input.offerId) {
    const offer = await prisma.offer.findUnique({ where: { id: input.offerId } });
    if (!offer) {
      return NextResponse.json({ error: "Offer not found" }, { status: 404 });
    }
    if (offer.buyerId !== user.id) {
      return NextResponse.json({ error: "Offer does not belong to you" }, { status: 403 });
    }
    if (offer.listingId !== listing.id) {
      return NextResponse.json({ error: "Offer is for a different listing" }, { status: 400 });
    }
    if (offer.status !== "ACCEPTED") {
      return NextResponse.json({ error: "Offer is not in an accepted state" }, { status: 409 });
    }
    // Each accepted offer can produce only one order (Order.acceptedOfferId is unique).
    const existing = await prisma.order.findUnique({ where: { acceptedOfferId: offer.id } });
    if (existing) {
      return NextResponse.json({ error: "Offer has already been redeemed" }, { status: 409 });
    }

    unitPrice = Number(offer.amount);
    orderQuantity = 1;
    acceptedOfferId = offer.id;
  }

  const available = listing.quantity - listing.quantitySold;
  if (orderQuantity > available) {
    return NextResponse.json({ error: `Only ${available} available` }, { status: 400 });
  }

  // Calculate shipping cost from listing options
  const shippingOptions = listing.shippingOptions as Array<{ method: string; price: number }> | null;
  const shippingOption = shippingOptions?.find((o) => o.method === input.shippingMethod);
  const shippingCost = shippingOption?.price ?? 0;

  const subtotal = unitPrice * orderQuantity;
  const platformFee = subtotal * (PLATFORM_FEE_PERCENT / 100);
  const total = subtotal + shippingCost;

  const order = await prisma.order.create({
    data: {
      listingId: listing.id,
      buyerId: user.id,
      sellerId: listing.sellerId,
      quantity: orderQuantity,
      subtotal,
      shipping: shippingCost,
      platformFee,
      total,
      shippingMethod: input.shippingMethod,
      shippingAddress: input.shippingAddress,
      status: "PENDING_PAYMENT",
      acceptedOfferId,
    },
  });

  return NextResponse.json({ data: order }, { status: 201 });
}
