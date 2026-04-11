import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { z } from "zod/v4";

const entrySchema = z.object({
  cardId: z.string().min(1),
  maxPrice: z.number().positive().max(99999.99),
  condition: z.enum(["MINT", "NEAR_MINT", "LIGHTLY_PLAYED", "MODERATELY_PLAYED", "HEAVILY_PLAYED", "DAMAGED"]).default("NEAR_MINT"),
  treatment: z.string().min(1),
  quantity: z.number().int().min(1).default(1),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const entries = await prisma.buylistEntry.findMany({
    where: { buylistId: id },
    include: {
      card: {
        select: { name: true, cardNumber: true, orbital: true, rarity: true, marketValue: { select: { marketMid: true } } },
      },
    },
    orderBy: { card: { name: "asc" } },
  });

  return NextResponse.json({ data: entries });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await requireUser();
  const body = await request.json();
  const parsed = entrySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.issues }, { status: 400 });
  }

  // Verify buylist ownership
  const buylist = await prisma.buylist.findUnique({ where: { id } });
  if (!buylist || buylist.userId !== user.id) {
    return NextResponse.json({ error: "Buylist not found" }, { status: 404 });
  }

  const input = parsed.data;

  const entry = await prisma.buylistEntry.upsert({
    where: {
      buylistId_cardId_treatment_condition: {
        buylistId: id,
        cardId: input.cardId,
        treatment: input.treatment,
        condition: input.condition,
      },
    },
    update: { maxPrice: input.maxPrice, quantity: input.quantity },
    create: {
      buylistId: id,
      cardId: input.cardId,
      maxPrice: input.maxPrice,
      condition: input.condition,
      treatment: input.treatment,
      quantity: input.quantity,
    },
  });

  // Record as BUYLIST_OFFER price data point
  await prisma.priceDataPoint.create({
    data: {
      cardId: input.cardId,
      source: "BUYLIST_OFFER",
      price: input.maxPrice,
      condition: input.condition,
      treatment: input.treatment,
      reportedBy: user.id,
      verified: true,
    },
  });

  return NextResponse.json({ data: entry }, { status: 201 });
}
