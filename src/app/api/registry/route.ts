import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Public Stonefoil + OCM registry. Lists every serialised card variant in
// the catalog with the count of public claims. Public means visibility !=
// PRIVATE; the underlying owner is anonymised when visibility =
// PUBLIC_ANONYMOUS. No auth required — the registry is the outward-facing
// view of who's holding what.
//
// Pagination is one page per HTTP call; the client can drive deeper
// inspection per-card via /api/registry/[setCode]/[cardNumber].

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const treatment = sp.get("treatment"); // "Stonefoil" | "OCM" | null
  const setCode = sp.get("set");
  const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(sp.get("limit") ?? "50", 10)));

  const where: Record<string, unknown> = { isSerialized: true };
  if (treatment === "Stonefoil" || treatment === "OCM") {
    where.treatment = treatment;
  } else {
    where.treatment = { in: ["Stonefoil", "OCM"] };
  }
  if (setCode) where.set = { code: setCode };

  const [cards, total] = await Promise.all([
    prisma.card.findMany({
      where,
      include: {
        set: { select: { code: true, name: true } },
      },
      orderBy: [{ set: { code: "asc" } }, { cardNumber: "asc" }, { treatment: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.card.count({ where }),
  ]);

  // Pull public claim counts for the page in one query rather than per-card.
  const cardIds = cards.map((c) => c.id);
  const publicClaims =
    cardIds.length > 0
      ? await prisma.dragonScale.findMany({
          where: {
            cardId: { in: cardIds },
            visibility: { not: "PRIVATE" },
          },
          select: { cardId: true, visibility: true, serialNumber: true },
        })
      : [];

  const claimsByCard = new Map<string, number>();
  for (const claim of publicClaims) {
    claimsByCard.set(claim.cardId, (claimsByCard.get(claim.cardId) ?? 0) + 1);
  }

  const data = cards.map((c) => ({
    cardId: c.id,
    cardNumber: c.cardNumber,
    name: c.name,
    rarity: c.rarity,
    treatment: c.treatment,
    setCode: c.set.code,
    setName: c.set.name,
    serialTotal: c.serialTotal,
    publicClaimCount: claimsByCard.get(c.id) ?? 0,
  }));

  return NextResponse.json({
    data,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
}
