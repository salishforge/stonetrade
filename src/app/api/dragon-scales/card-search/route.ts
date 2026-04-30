import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { SCORING_TREATMENTS } from "@/lib/dragon/constants";

// Picker for the AddScaleDialog. Returns one entry per (set, cardNumber) that
// has at least one Dragon-eligible treatment row, with all eligible treatment
// rows attached. Dragon-eligible = either the card is in one of the four
// scoring treatments, or it's a token (which carries its own scoring path).
//
// Bundling treatment options per base card lets the dialog show "Eternal
// Monolith — pick treatment" in a single fetch instead of one round-trip per
// treatment. The /api/cards endpoint can't satisfy this in one call because
// it defaults to Classic Paper and doesn't group.
export async function GET(request: NextRequest) {
  await requireUser();

  const q = request.nextUrl.searchParams.get("q") ?? "";
  const limit = Math.min(parseInt(request.nextUrl.searchParams.get("limit") ?? "20", 10), 100);

  if (q.trim().length < 2) {
    return NextResponse.json({ data: [] });
  }

  const rows = await prisma.card.findMany({
    where: {
      name: { contains: q, mode: "insensitive" },
      OR: [{ treatment: { in: [...SCORING_TREATMENTS] } }, { isToken: true }],
    },
    select: {
      id: true,
      name: true,
      cardNumber: true,
      rarity: true,
      treatment: true,
      isStoneseeker: true,
      isLoreMythic: true,
      isToken: true,
      imageUrl: true,
      set: { select: { code: true, name: true } },
    },
    orderBy: [{ cardNumber: "asc" }, { treatment: "asc" }],
    take: limit * 5, // generous: caller dedupes by (setCode, cardNumber)
  });

  // Group by base card identity. Within each group, surface the per-treatment
  // Card.id so the dialog can submit cardId without a second roundtrip.
  type Group = {
    cardNumber: string;
    name: string;
    rarity: string;
    isStoneseeker: boolean;
    isLoreMythic: boolean;
    isToken: boolean;
    imageUrl: string | null;
    setCode: string;
    setName: string;
    treatments: Array<{ id: string; treatment: string }>;
  };

  const groups = new Map<string, Group>();
  for (const r of rows) {
    const key = `${r.set.code}::${r.cardNumber}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        cardNumber: r.cardNumber,
        name: r.name,
        rarity: r.rarity,
        isStoneseeker: r.isStoneseeker,
        isLoreMythic: r.isLoreMythic,
        isToken: r.isToken,
        imageUrl: r.imageUrl,
        setCode: r.set.code,
        setName: r.set.name,
        treatments: [],
      };
      groups.set(key, g);
    }
    g.treatments.push({ id: r.id, treatment: r.treatment });
  }

  const data = Array.from(groups.values()).slice(0, limit);
  return NextResponse.json({ data });
}
