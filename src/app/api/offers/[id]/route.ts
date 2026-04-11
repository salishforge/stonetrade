import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
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
    include: { listing: true },
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
