import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { triggerNotification } from "@/lib/notify/novu";
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

  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    include: { seller: true, card: { select: { name: true } } },
  });
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

  // Notify seller. The offer is the source-of-truth idempotency key — Novu
  // dedupes on it, so a retried POST that returns the same offer.id won't
  // double-fire (Prisma create is not idempotent on its own, but the call
  // path here is single-shot — safe enough).
  const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  await triggerNotification({
    workflowId: "offer-received",
    to: {
      id: listing.seller.id,
      email: listing.seller.email,
      username: listing.seller.username,
    },
    payload: {
      offerId: offer.id,
      listingId: listing.id,
      cardName: listing.card?.name ?? "Listing",
      buyerUsername: user.username,
      offerAmount: amount.toFixed(2),
      listingPrice: Number(listing.price).toFixed(2),
      message: message ?? "",
      offerUrl: `${appBaseUrl}/listings/offers`,
    },
    transactionId: offer.id,
  });

  return NextResponse.json({ data: offer }, { status: 201 });
}
