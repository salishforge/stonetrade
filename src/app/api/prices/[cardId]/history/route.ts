import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ cardId: string }> }
) {
  const { cardId } = await params;
  const days = parseInt(request.nextUrl.searchParams.get("days") ?? "90", 10);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const dataPoints = await prisma.priceDataPoint.findMany({
    where: {
      cardId,
      createdAt: { gte: since },
    },
    select: {
      price: true,
      source: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({
    data: dataPoints.map((dp) => ({
      price: Number(dp.price),
      source: dp.source,
      date: dp.createdAt.toISOString(),
    })),
  });
}
