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

  const available = listing.quantity - listing.quantitySold;
  if (input.quantity > available) {
    return NextResponse.json({ error: `Only ${available} available` }, { status: 400 });
  }

  // Calculate shipping cost from listing options
  const shippingOptions = listing.shippingOptions as Array<{ method: string; price: number }> | null;
  const shippingOption = shippingOptions?.find((o) => o.method === input.shippingMethod);
  const shippingCost = shippingOption?.price ?? 0;

  const subtotal = Number(listing.price) * input.quantity;
  const platformFee = subtotal * (PLATFORM_FEE_PERCENT / 100);
  const total = subtotal + shippingCost;

  // Create order — in dev mode, auto-mark as PAID (mock Stripe)
  const order = await prisma.order.create({
    data: {
      listingId: listing.id,
      buyerId: user.id,
      sellerId: listing.sellerId,
      subtotal,
      shipping: shippingCost,
      platformFee,
      total,
      shippingMethod: input.shippingMethod,
      shippingAddress: input.shippingAddress,
      status: "PAID", // Mock: skip PENDING_PAYMENT in dev
      paidAt: new Date(),
    },
  });

  // Update listing sold count
  await prisma.listing.update({
    where: { id: listing.id },
    data: {
      quantitySold: { increment: input.quantity },
      status: listing.quantity - listing.quantitySold - input.quantity <= 0 ? "SOLD" : "ACTIVE",
    },
  });

  // Record price data point for completed sale
  if (listing.cardId) {
    await prisma.priceDataPoint.create({
      data: {
        cardId: listing.cardId,
        source: "COMPLETED_SALE",
        price: listing.price,
        condition: listing.condition ?? "NEAR_MINT",
        treatment: listing.treatment ?? "Classic Paper",
        listingId: listing.id,
        verified: true,
      },
    });
  }

  return NextResponse.json({ data: order }, { status: 201 });
}
