import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const status = request.nextUrl.searchParams.get("status") ?? "ACTIVE";
  const limit = parseInt(request.nextUrl.searchParams.get("limit") ?? "20", 10);

  const polls = await prisma.valuePoll.findMany({
    where: { status: status as "ACTIVE" | "CLOSED" | "EXPIRED" },
    include: {
      card: { select: { name: true, cardNumber: true, orbital: true, rarity: true } },
      _count: { select: { votes: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return NextResponse.json({ data: polls });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { cardId, treatment } = body as { cardId: string; treatment: string };

  if (!cardId || !treatment) {
    return NextResponse.json({ error: "cardId and treatment required" }, { status: 400 });
  }

  // Check no active poll exists for this card+treatment
  const existing = await prisma.valuePoll.findFirst({
    where: { cardId, treatment, status: "ACTIVE" },
  });
  if (existing) {
    return NextResponse.json({ error: "Active poll already exists", data: existing }, { status: 409 });
  }

  const poll = await prisma.valuePoll.create({
    data: {
      cardId,
      treatment,
      priceRanges: [
        { min: 0, max: 1, label: "$0-1" },
        { min: 1, max: 5, label: "$1-5" },
        { min: 5, max: 15, label: "$5-15" },
        { min: 15, max: 30, label: "$15-30" },
        { min: 30, max: 50, label: "$30-50" },
        { min: 50, max: 100, label: "$50-100" },
        { min: 100, max: 250, label: "$100-250" },
        { min: 250, max: 99999, label: "$250+" },
      ],
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    },
  });

  return NextResponse.json({ data: poll }, { status: 201 });
}
