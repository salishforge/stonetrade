import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminUser } from "@/lib/auth";
import { searchSoldItems, isEbayConfigured } from "@/lib/ebay/client";
import { mapEbayItemsToPriceDataPoints } from "@/lib/ebay/ingest";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ cardId: string }> },
) {
  void request;
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Admin required" }, { status: 403 });

  const { cardId } = await params;
  if (!cardId || typeof cardId !== "string") {
    return NextResponse.json({ error: "cardId required" }, { status: 400 });
  }

  const card = await prisma.card.findUnique({
    where: { id: cardId },
    include: { set: true },
  });

  if (!card) {
    return NextResponse.json({ error: "Card not found" }, { status: 404 });
  }

  if (!isEbayConfigured()) {
    return NextResponse.json(
      { error: "eBay integration not configured" },
      { status: 503 },
    );
  }

  // Search query: card name + set code; refine later if recall/precision needs tuning.
  const query = `${card.name} ${card.set.code}`;
  let items;
  try {
    items = await searchSoldItems(query, 25);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    return NextResponse.json(
      { error: `eBay API error: ${msg}` },
      { status: 502 },
    );
  }

  const rows = mapEbayItemsToPriceDataPoints(cardId, items);

  // No unique constraint on ebayListingId in schema; skipDuplicates not applicable here.
  await prisma.priceDataPoint.createMany({ data: rows });

  return NextResponse.json({
    data: { cardId, fetched: items.length, persisted: rows.length },
  });
}
