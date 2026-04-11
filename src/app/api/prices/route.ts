import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const cardId = request.nextUrl.searchParams.get("cardId");

  if (!cardId) {
    return NextResponse.json({ error: "cardId required" }, { status: 400 });
  }

  const [marketValue, dataPoints] = await Promise.all([
    prisma.cardMarketValue.findUnique({ where: { cardId } }),
    prisma.priceDataPoint.findMany({
      where: { cardId },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  // Group by source for breakdown
  const sourceCounts: Record<string, number> = {};
  for (const dp of dataPoints) {
    sourceCounts[dp.source] = (sourceCounts[dp.source] ?? 0) + 1;
  }

  return NextResponse.json({
    data: {
      marketValue,
      recentDataPoints: dataPoints.slice(0, 20).map((dp) => ({
        id: dp.id,
        price: dp.price,
        source: dp.source,
        condition: dp.condition,
        treatment: dp.treatment,
        verified: dp.verified,
        createdAt: dp.createdAt,
      })),
      sourceCounts,
      totalDataPoints: dataPoints.length,
    },
  });
}
