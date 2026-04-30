import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { previewDragonScaleSchema } from "@/lib/validators/dragon";
import { scoreScale } from "@/lib/dragon/score-scale";

// Score a hypothetical scale without persisting it. Lets the AddScaleDialog
// show a live points preview while keeping the scoring engine and constants
// as the single source of truth — the client never reproduces the math.
export async function POST(request: NextRequest) {
  await requireUser();

  const body = await request.json();
  const parsed = previewDragonScaleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const input = parsed.data;
  const card = await prisma.card.findUnique({
    where: { id: input.cardId },
    select: {
      treatment: true,
      rarity: true,
      isStoneseeker: true,
      isLoreMythic: true,
      isToken: true,
      set: { select: { code: true } },
    },
  });
  if (!card) {
    return NextResponse.json({ error: "Card not found" }, { status: 404 });
  }

  const breakdown = scoreScale(
    {
      treatment: card.treatment,
      bonusVariant: card.isToken ? "NONE" : input.bonusVariant,
      quantity: input.quantity,
    },
    card,
  );

  return NextResponse.json({ data: breakdown });
}
