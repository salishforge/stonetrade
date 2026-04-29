import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { z } from "zod/v4";
import { matchAgainstCollectionAdd } from "@/lib/bounties/match";

const addCardSchema = z.object({
  cardId: z.string().min(1),
  quantity: z.number().int().min(1).default(1),
  condition: z.enum(["MINT", "NEAR_MINT", "LIGHTLY_PLAYED", "MODERATELY_PLAYED", "HEAVILY_PLAYED", "DAMAGED"]).default("NEAR_MINT"),
  treatment: z.string().min(1),
  serialNumber: z.string().nullable().optional(),
  acquiredPrice: z.number().positive().nullable().optional(),
  acquiredFrom: z.string().nullable().optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const cards = await prisma.collectionCard.findMany({
    where: { collectionId: id },
    include: {
      card: {
        include: {
          game: { select: { name: true, slug: true } },
          set: { select: { name: true, code: true } },
          marketValue: { select: { marketMid: true } },
        },
      },
    },
    orderBy: { card: { cardNumber: "asc" } },
  });

  // Calculate total value
  let totalValue = 0;
  for (const cc of cards) {
    if (cc.card.marketValue?.marketMid) {
      totalValue += Number(cc.card.marketValue.marketMid) * cc.quantity;
    }
  }

  return NextResponse.json({ data: cards, totalValue });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await requireUser();
  const body = await request.json();
  const parsed = addCardSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.issues }, { status: 400 });
  }

  // Verify collection ownership
  const collection = await prisma.collection.findUnique({ where: { id } });
  if (!collection || collection.userId !== user.id) {
    return NextResponse.json({ error: "Collection not found" }, { status: 404 });
  }

  const input = parsed.data;

  const collectionCard = await prisma.collectionCard.upsert({
    where: {
      collectionId_cardId_treatment_condition_serialNumber: {
        collectionId: id,
        cardId: input.cardId,
        treatment: input.treatment,
        condition: input.condition,
        serialNumber: input.serialNumber ?? "",
      },
    },
    update: {
      quantity: { increment: input.quantity },
    },
    create: {
      collectionId: id,
      cardId: input.cardId,
      quantity: input.quantity,
      condition: input.condition,
      treatment: input.treatment,
      serialNumber: input.serialNumber ?? "",
      acquiredPrice: input.acquiredPrice ?? null,
      acquiredDate: new Date(),
      acquiredFrom: input.acquiredFrom ?? null,
    },
  });

  // Bounty notification: someone added the card to their collection. If a
  // bounty exists for that card, ping the bounty owner so they can DM the
  // collector. Auto-buy is intentionally NOT triggered on collection adds —
  // a collector hasn't agreed to sell.
  await matchAgainstCollectionAdd({
    cardId: input.cardId,
    treatment: input.treatment,
    condition: input.condition,
    collectorId: user.id,
  });

  return NextResponse.json({ data: collectionCard }, { status: 201 });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await requireUser();
  const body = await request.json();
  const { collectionCardId } = body;

  if (!collectionCardId) {
    return NextResponse.json({ error: "collectionCardId required" }, { status: 400 });
  }

  const collection = await prisma.collection.findUnique({ where: { id } });
  if (!collection || collection.userId !== user.id) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  await prisma.collectionCard.delete({ where: { id: collectionCardId } });

  return NextResponse.json({ data: { success: true } });
}
