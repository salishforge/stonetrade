import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  const game = searchParams.get("game");
  const set = searchParams.get("set");
  const orbital = searchParams.get("orbital");
  const rarity = searchParams.get("rarity");
  const treatment = searchParams.get("treatment");
  const cardType = searchParams.get("cardType");
  const search = searchParams.get("q");
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "40", 10), 100);
  const sort = searchParams.get("sort") ?? "cardNumber";

  const where: Record<string, unknown> = {};

  if (game) where.game = { slug: game };
  if (set) where.set = { code: set };
  if (orbital) where.orbital = orbital;
  if (rarity) where.rarity = rarity;
  if (treatment) where.treatment = treatment;
  if (cardType) where.cardType = cardType;
  if (search) {
    where.name = { contains: search, mode: "insensitive" };
  }

  // Default: show only Classic Paper to avoid overwhelming with all treatments
  if (!treatment) {
    where.treatment = "Classic Paper";
  }

  const orderBy: Record<string, string> = {};
  if (sort === "name") orderBy.name = "asc";
  else if (sort === "rarity") orderBy.rarity = "asc";
  else orderBy.cardNumber = "asc";

  const [cards, total] = await Promise.all([
    prisma.card.findMany({
      where,
      include: {
        game: { select: { name: true, slug: true } },
        set: { select: { name: true, code: true } },
        marketValue: {
          select: { marketLow: true, marketMid: true, marketHigh: true, confidence: true },
        },
      },
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.card.count({ where }),
  ]);

  return NextResponse.json({
    data: cards,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
}
