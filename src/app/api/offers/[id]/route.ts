import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { triggerNotification } from "@/lib/notify/novu";
import { z } from "zod/v4";

const respondSchema = z.object({
  action: z.enum(["accept", "decline", "counter", "withdraw"]),
  counterAmount: z.number().positive().max(99999.99).optional(),
  message: z.string().max(500).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await requireUser();
  const body = await request.json();
  const parsed = respondSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  const offer = await prisma.offer.findUnique({
    where: { id },
    include: { listing: { include: { card: { select: { name: true } } } } },
  });

  if (!offer || offer.status !== "PENDING") {
    return NextResponse.json({ error: "Offer not found or not pending" }, { status: 404 });
  }

  const { action, counterAmount, message } = parsed.data;
  const isSeller = offer.listing.sellerId === user.id;
  const isBuyer = offer.buyerId === user.id;

  if (action === "accept" && isSeller) {
    await prisma.offer.update({
      where: { id },
      data: { status: "ACCEPTED", respondedAt: new Date() },
    });

    // Fan out "outbid" to every other PENDING offer's buyer on the same
    // listing. Their offer isn't auto-rejected by accepting one (existing
    // product behavior), but the listing is effectively spoken for. Each
    // outbid trigger is keyed by the losing offer's id so retries dedupe.
    const otherOffers = await prisma.offer.findMany({
      where: {
        listingId: offer.listingId,
        status: "PENDING",
        id: { not: id },
      },
      include: { buyer: true },
    });
    const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    for (const other of otherOffers) {
      await triggerNotification({
        workflowId: "outbid",
        to: {
          id: other.buyer.id,
          email: other.buyer.email,
          username: other.buyer.username,
        },
        payload: {
          offerId: other.id,
          listingId: offer.listingId,
          cardName: offer.listing.card?.name ?? "Listing",
          yourOffer: Number(other.amount).toFixed(2),
          acceptedAmount: Number(offer.amount).toFixed(2),
          listingUrl: `${appBaseUrl}/listings/${offer.listingId}`,
        },
        transactionId: `outbid:${other.id}`,
      });
    }

    return NextResponse.json({ data: { success: true, action: "accepted" } });
  }

  if (action === "decline" && isSeller) {
    await prisma.offer.update({
      where: { id },
      data: { status: "DECLINED", respondedAt: new Date() },
    });
    return NextResponse.json({ data: { success: true, action: "declined" } });
  }

  if (action === "counter" && isSeller && counterAmount) {
    await prisma.offer.update({
      where: { id },
      data: { status: "COUNTERED", respondedAt: new Date() },
    });

    const counter = await prisma.offer.create({
      data: {
        listingId: offer.listingId,
        buyerId: offer.buyerId,
        amount: counterAmount,
        message: message ?? null,
        parentOfferId: id,
        expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      },
    });

    return NextResponse.json({ data: { success: true, action: "countered", counterId: counter.id } });
  }

  if (action === "withdraw" && isBuyer) {
    await prisma.offer.update({
      where: { id },
      data: { status: "WITHDRAWN", respondedAt: new Date() },
    });
    return NextResponse.json({ data: { success: true, action: "withdrawn" } });
  }

  return NextResponse.json({ error: "Invalid action for this user" }, { status: 403 });
}
