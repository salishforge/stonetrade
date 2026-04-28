import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { recalculateCardValue } from "@/lib/pricing/recalculate";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; entryId: string }> },
) {
  const { id, entryId } = await params;
  const user = await requireUser();

  const buylist = await prisma.buylist.findUnique({ where: { id } });
  if (!buylist || buylist.userId !== user.id) {
    return NextResponse.json({ error: "Buylist not found" }, { status: 404 });
  }

  const entry = await prisma.buylistEntry.findUnique({ where: { id: entryId } });
  if (!entry || entry.buylistId !== id) {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }

  const cardId = entry.cardId;

  await prisma.buylistEntry.delete({ where: { id: entryId } });

  // Demand decreased — refresh CardMarketValue (scarcity ratio uses totalWanted).
  try {
    await recalculateCardValue(cardId);
  } catch (err) {
    console.error("CardMarketValue recompute failed for", cardId, err);
  }

  return NextResponse.json({ data: { success: true } });
}
