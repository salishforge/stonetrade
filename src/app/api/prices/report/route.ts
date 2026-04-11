import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { z } from "zod/v4";

const reportSchema = z.object({
  cardId: z.string().min(1),
  price: z.number().positive().max(99999.99),
  condition: z.enum(["MINT", "NEAR_MINT", "LIGHTLY_PLAYED", "MODERATELY_PLAYED", "HEAVILY_PLAYED", "DAMAGED"]),
  treatment: z.string().min(1),
  platform: z.string().min(1),
  saleDate: z.string().transform((s) => new Date(s)),
  proofUrl: z.string().nullable().optional(),
});

export async function POST(request: NextRequest) {
  const user = await requireUser();
  const body = await request.json();
  const parsed = reportSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.issues }, { status: 400 });
  }

  const input = parsed.data;

  // Verify card exists
  const card = await prisma.card.findUnique({ where: { id: input.cardId } });
  if (!card) {
    return NextResponse.json({ error: "Card not found" }, { status: 404 });
  }

  const report = await prisma.saleReport.create({
    data: {
      reporterId: user.id,
      cardId: input.cardId,
      price: input.price,
      condition: input.condition,
      treatment: input.treatment,
      platform: input.platform,
      saleDate: input.saleDate,
      proofUrl: input.proofUrl ?? null,
    },
  });

  // Create an unverified price data point (weighted low until verified)
  await prisma.priceDataPoint.create({
    data: {
      cardId: input.cardId,
      source: "MANUAL_REPORT",
      price: input.price,
      condition: input.condition,
      treatment: input.treatment,
      reportedBy: user.id,
      verified: false,
    },
  });

  return NextResponse.json({ data: report }, { status: 201 });
}
