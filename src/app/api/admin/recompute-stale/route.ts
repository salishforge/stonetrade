import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { prisma } from "@/lib/prisma";
import { getAdminUser, isCronAuthorized } from "@/lib/auth";
import { recalculateCardValue } from "@/lib/pricing/recalculate";

const querySchema = z.object({
  olderThanMinutes: z.coerce.number().int().min(1).max(60 * 24 * 7).default(60),
  maxCards: z.coerce.number().int().min(1).max(2000).default(500),
});

/**
 * Cron-driven freshening of CardMarketValue rows. Picks rows whose
 * lastUpdated is older than the threshold and recomputes them. Bounded by
 * maxCards so a single invocation has a known cost ceiling.
 */
export async function POST(request: NextRequest) {
  const cronOk = isCronAuthorized(request);
  if (!cronOk) {
    const admin = await getAdminUser();
    if (!admin) return NextResponse.json({ error: "Admin or CRON_TOKEN required" }, { status: 403 });
  }

  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.issues }, { status: 400 });
  }

  const cutoff = new Date(Date.now() - parsed.data.olderThanMinutes * 60 * 1000);
  const stale = await prisma.cardMarketValue.findMany({
    where: { lastUpdated: { lt: cutoff } },
    select: { cardId: true },
    orderBy: { lastUpdated: "asc" },
    take: parsed.data.maxCards,
  });

  let recomputed = 0;
  let failed = 0;
  for (const { cardId } of stale) {
    try {
      await recalculateCardValue(cardId);
      recomputed++;
    } catch (err) {
      console.error("recompute-stale: failed for", cardId, err);
      failed++;
    }
  }

  return NextResponse.json({
    data: {
      candidates: stale.length,
      recomputed,
      failed,
      olderThanMinutes: parsed.data.olderThanMinutes,
    },
  });
}
