import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { z } from "zod/v4";

const createOfferSchema = z.object({
  listingId: z.string().min(1),
  amount: z.number().positive().max(99999.99),
  message: z.string().max(500).nullable().optional(),
});

export async function GET() {
  const user = await requireUser();

  const [incoming, outgoing] = await Promise.all([
    prisma.offer.findMany({
      where: { listing: { sellerId: user.id }, status: "PENDING" },
      include: {
        listing: { include: { card: { select: { name: true, cardNumber: true, treatment: true } } } },
        buyer: { select: { username: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.offer.findMany({
      where: { buyerId: user.id },
      include: {
        listing: { include: { card: { select: { name: true, cardNumber: true, treatment: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);

  return NextResponse.json({ data: { incoming, outgoing } });
}

export async function POST(request: NextRequest) {
  const user = await requireUser();
  const body = await request.json();
  const parsed = createOfferSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.issues }, { status: 400 });
  }

  const { listingId, amount, message } = parsed.data;

  const listing = await prisma.listing.findUnique({ where: { id: listingId } });
  if (!listing || listing.status !== "ACTIVE") {
    return NextResponse.json({ error: "Listing not available" }, { status: 404 });
  }
  if (listing.sellerId === user.id) {
    return NextResponse.json({ error: "Cannot offer on your own listing" }, { status: 400 });
  }
  if (!listing.allowOffers) {
    return NextResponse.json({ error: "Seller does not accept offers" }, { status: 400 });
  }
  if (listing.minimumOffer && amount < Number(listing.minimumOffer)) {
    return NextResponse.json({ error: `Minimum offer is $${Number(listing.minimumOffer).toFixed(2)}` }, { status: 400 });
  }

  const offer = await prisma.offer.create({
    data: {
      listingId,
      buyerId: user.id,
      amount,
      message: message ?? null,
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000), // 48 hours
    },
  });

  return NextResponse.json({ data: offer }, { status: 201 });
}
