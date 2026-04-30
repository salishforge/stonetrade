import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { createTradeSchema } from "@/lib/validators/trade";

const DEFAULT_EXPIRY_HOURS = 72;

export async function GET(request: NextRequest) {
  const user = await requireUser();
  const role = request.nextUrl.searchParams.get("role"); // "proposer" | "recipient" | null
  const where =
    role === "proposer" ? { proposerId: user.id }
    : role === "recipient" ? { recipientId: user.id }
    : { OR: [{ proposerId: user.id }, { recipientId: user.id }] };

  const trades = await prisma.trade.findMany({
    where,
    include: {
      items: {
        include: {
          card: { select: { id: true, name: true, cardNumber: true } },
        },
      },
      proposer: { select: { id: true, username: true } },
      recipient: { select: { id: true, username: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ data: trades });
}

export async function POST(request: NextRequest) {
  const user = await requireUser();
  const body = await request.json();
  const parsed = createTradeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.issues }, { status: 400 });
  }

  const input = parsed.data;

  if (input.recipientId === user.id) {
    return NextResponse.json({ error: "Cannot trade with yourself" }, { status: 400 });
  }

  const recipient = await prisma.user.findUnique({ where: { id: input.recipientId } });
  if (!recipient) {
    return NextResponse.json({ error: "Recipient not found" }, { status: 404 });
  }

  // Verify every referenced card exists. Cheaper to check upfront than to
  // fail mid-transaction with a foreign key error.
  const cardIds = [
    ...input.fromProposer.map((i) => i.cardId),
    ...input.fromRecipient.map((i) => i.cardId),
  ];
  const cards = await prisma.card.findMany({ where: { id: { in: cardIds } }, select: { id: true } });
  if (cards.length !== new Set(cardIds).size) {
    return NextResponse.json({ error: "One or more cards not found" }, { status: 404 });
  }

  const expiresAt = input.expiresAt
    ? new Date(input.expiresAt)
    : new Date(Date.now() + DEFAULT_EXPIRY_HOURS * 60 * 60 * 1000);

  const trade = await prisma.trade.create({
    data: {
      proposerId: user.id,
      recipientId: input.recipientId,
      cashAdjustment: input.cashAdjustment ?? null,
      message: input.message ?? null,
      expiresAt,
      items: {
        create: [
          ...input.fromProposer.map((i) => ({
            cardId: i.cardId,
            fromProposer: true,
            quantity: i.quantity,
            condition: i.condition,
            treatment: i.treatment,
          })),
          ...input.fromRecipient.map((i) => ({
            cardId: i.cardId,
            fromProposer: false,
            quantity: i.quantity,
            condition: i.condition,
            treatment: i.treatment,
          })),
        ],
      },
    },
    include: {
      items: true,
    },
  });

  return NextResponse.json({ data: trade }, { status: 201 });
}
