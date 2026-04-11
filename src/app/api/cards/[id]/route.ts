import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const card = await prisma.card.findUnique({
    where: { id },
    include: {
      game: true,
      set: true,
      marketValue: true,
      listings: {
        where: { status: "ACTIVE" },
        include: { seller: { select: { username: true, sellerRating: true, totalSales: true } } },
        orderBy: { price: "asc" },
        take: 10,
      },
      priceHistory: {
        orderBy: { createdAt: "desc" },
        take: 20,
      },
    },
  });

  if (!card) {
    return NextResponse.json({ error: "Card not found" }, { status: 404 });
  }

  // Fetch all treatment variants of the same base card
  const treatments = await prisma.card.findMany({
    where: {
      setId: card.setId,
      cardNumber: card.cardNumber,
    },
    select: {
      id: true,
      treatment: true,
      isSerialized: true,
      serialTotal: true,
      marketValue: {
        select: { marketMid: true, confidence: true },
      },
    },
    orderBy: { treatment: "asc" },
  });

  return NextResponse.json({ data: { ...card, treatments } });
}
