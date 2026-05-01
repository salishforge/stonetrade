import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { syncEbayPricesForCards, syncEbayPricesForGame } from "@/lib/ebay/sync";
import { isEbayConfigured, ebayEnvironment } from "@/lib/ebay/client";

const bodySchema = z.union([
  z.object({
    cardIds: z.array(z.string().min(1)).min(1).max(500),
    includeSold: z.boolean().optional(),
    perCardLimit: z.number().int().min(1).max(200).optional(),
  }),
  z.object({
    gameSlug: z.string().min(1),
    setCode: z.string().optional(),
    includeSold: z.boolean().optional(),
    perCardLimit: z.number().int().min(1).max(200).optional(),
  }),
]);

export async function GET() {
  return NextResponse.json({
    data: {
      configured: isEbayConfigured(),
      environment: isEbayConfigured() ? ebayEnvironment() : null,
    },
  });
}

export async function POST(request: NextRequest) {
  if (!isEbayConfigured()) {
    return NextResponse.json(
      { error: "eBay is not configured. Set EBAY_APP_ID and EBAY_CERT_ID." },
      { status: 503 }
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 400 });
  }

  if ("cardIds" in parsed.data) {
    const { prisma } = await import("@/lib/prisma");
    const cards = await prisma.card.findMany({
      where: { id: { in: parsed.data.cardIds } },
      select: { id: true, name: true, cardNumber: true, treatment: true },
    });
    const result = await syncEbayPricesForCards(cards, {
      includeSold: parsed.data.includeSold,
      perCardLimit: parsed.data.perCardLimit,
    });
    return NextResponse.json({ data: result });
  }

  const result = await syncEbayPricesForGame(parsed.data.gameSlug, {
    setCode: parsed.data.setCode,
    includeSold: parsed.data.includeSold,
    perCardLimit: parsed.data.perCardLimit,
  });
  return NextResponse.json({ data: result });
}
