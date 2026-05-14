import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { syncPricechartingForCards, syncPricechartingForGame } from "@/lib/pricecharting/sync";
import { isPricechartingConfigured } from "@/lib/pricecharting/client";
import { getAdminUser, isCronAuthorized } from "@/lib/auth";

const bodySchema = z.union([
  z.object({
    cardIds: z.array(z.string().min(1)).min(1).max(500),
  }),
  z.object({
    gameSlug: z.string().min(1),
    setCode: z.string().optional(),
  }),
]);

async function authorize(request: NextRequest): Promise<NextResponse | null> {
  if (isCronAuthorized(request)) return null;
  const admin = await getAdminUser();
  if (admin) return null;
  return NextResponse.json({ error: "Admin or CRON_TOKEN required" }, { status: 403 });
}

export async function GET(request: NextRequest) {
  const denied = await authorize(request);
  if (denied) return denied;

  return NextResponse.json({ data: { configured: isPricechartingConfigured() } });
}

export async function POST(request: NextRequest) {
  const denied = await authorize(request);
  if (denied) return denied;

  if (!isPricechartingConfigured()) {
    return NextResponse.json(
      { error: "PriceCharting is not configured. Set PRICECHARTING_API_TOKEN." },
      { status: 503 }
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body" },
      { status: 400 }
    );
  }

  if ("cardIds" in parsed.data) {
    const { prisma } = await import("@/lib/prisma");
    const rows = await prisma.card.findMany({
      where: { id: { in: parsed.data.cardIds } },
      select: {
        id: true,
        name: true,
        cardNumber: true,
        treatment: true,
        pricechartingId: true,
        set: { select: { name: true } },
        game: { select: { name: true } },
      },
    });
    const cards = rows.map((r) => ({
      id: r.id,
      name: r.name,
      cardNumber: r.cardNumber,
      treatment: r.treatment,
      pricechartingId: r.pricechartingId,
      setName: r.set.name,
      gameName: r.game.name,
    }));
    const result = await syncPricechartingForCards(cards);
    return NextResponse.json({ data: result });
  }

  const result = await syncPricechartingForGame(parsed.data.gameSlug, {
    setCode: parsed.data.setCode,
  });
  return NextResponse.json({ data: result });
}
