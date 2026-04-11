import { NextRequest, NextResponse } from "next/server";
import { recalculateCardValue, recalculateAllCardValues } from "@/lib/pricing/recalculate";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const cardId = (body as Record<string, unknown>).cardId as string | undefined;

  if (cardId) {
    const result = await recalculateCardValue(cardId);
    return NextResponse.json({ data: result });
  }

  const result = await recalculateAllCardValues();
  return NextResponse.json({ data: result });
}
