import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { createListingSchema } from "@/lib/validators/listing";
import { recalculateCardValue } from "@/lib/pricing/recalculate";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  const cardId = searchParams.get("cardId");
  const sellerId = searchParams.get("sellerId");
  const status = searchParams.get("status") ?? "ACTIVE";
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 100);
  const sort = searchParams.get("sort") ?? "createdAt";

  const where: Record<string, unknown> = {};
  if (cardId) where.cardId = cardId;
  if (sellerId) where.sellerId = sellerId;
  if (status !== "all") where.status = status;

  const orderBy: Record<string, string> = {};
  if (sort === "price_asc") orderBy.price = "asc";
  else if (sort === "price_desc") orderBy.price = "desc";
  else orderBy.createdAt = "desc";

  const [listings, total] = await Promise.all([
    prisma.listing.findMany({
      where,
      include: {
        card: { select: { id: true, name: true, cardNumber: true, orbital: true, rarity: true, imageUrl: true } },
        seller: { select: { username: true, sellerRating: true, totalSales: true } },
      },
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.listing.count({ where }),
  ]);

  return NextResponse.json({ data: listings, total, page, limit, totalPages: Math.ceil(total / limit) });
}

export async function POST(request: NextRequest) {
  const user = await requireUser();
  const body = await request.json();
  const parsed = createListingSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.issues }, { status: 400 });
  }

  const input = parsed.data;

  // Verify card exists
  const card = await prisma.card.findUnique({ where: { id: input.cardId } });
  if (!card) {
    return NextResponse.json({ error: "Card not found" }, { status: 404 });
  }

  const listing = await prisma.listing.create({
    data: {
      sellerId: user.id,
      type: "SINGLE",
      cardId: input.cardId,
      condition: input.condition,
      treatment: input.treatment,
      price: input.price,
      quantity: input.quantity,
      allowOffers: input.allowOffers,
      minimumOffer: input.minimumOffer ?? null,
      serialNumber: input.serialNumber ?? null,
      shipsFrom: input.shipsFrom ?? null,
      shippingOptions: input.shippingOptions ?? undefined,
      photos: [],
    },
    include: {
      card: { select: { name: true, cardNumber: true } },
    },
  });

  // Refresh CardMarketValue (supply/scarcity drift). Wrap so a recompute
  // outage doesn't block the seller's listing creation.
  try {
    await recalculateCardValue(input.cardId);
  } catch (err) {
    console.error("CardMarketValue recompute failed for", input.cardId, err);
  }

  return NextResponse.json({ data: listing }, { status: 201 });
}
