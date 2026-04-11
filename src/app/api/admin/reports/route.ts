import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { recalculateCardValue } from "@/lib/pricing/recalculate";

export async function GET() {
  const reports = await prisma.saleReport.findMany({
    where: { verified: false },
    include: {
      reporter: { select: { username: true, credibilityScore: true } },
      card: { select: { name: true, cardNumber: true, treatment: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ data: reports });
}

export async function PATCH(request: NextRequest) {
  const user = await requireUser();
  const body = await request.json();
  const { reportId, action } = body as { reportId: string; action: "verify" | "reject" };

  if (!reportId || !action) {
    return NextResponse.json({ error: "reportId and action required" }, { status: 400 });
  }

  const report = await prisma.saleReport.findUnique({ where: { id: reportId } });
  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  if (action === "verify") {
    await prisma.saleReport.update({
      where: { id: reportId },
      data: { verified: true, verifiedBy: user.id },
    });

    // Mark the corresponding price data point as verified
    await prisma.priceDataPoint.updateMany({
      where: { cardId: report.cardId, source: "MANUAL_REPORT", reportedBy: report.reporterId, verified: false },
      data: { verified: true },
    });

    // Recalculate card value
    await recalculateCardValue(report.cardId);

    // Boost reporter credibility
    await prisma.user.update({
      where: { id: report.reporterId },
      data: { credibilityScore: { increment: 0.1 } },
    });
  } else {
    // Remove the unverified price data point
    await prisma.priceDataPoint.deleteMany({
      where: { cardId: report.cardId, source: "MANUAL_REPORT", reportedBy: report.reporterId, verified: false },
    });

    await prisma.saleReport.delete({ where: { id: reportId } });

    // Decrease reporter credibility slightly
    await prisma.user.update({
      where: { id: report.reporterId },
      data: { credibilityScore: { decrement: 0.05 } },
    });
  }

  return NextResponse.json({ data: { success: true, action } });
}
