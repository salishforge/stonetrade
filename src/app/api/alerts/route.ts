import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { createAlertSchema } from "@/lib/validators/alert";

export async function GET() {
  const user = await requireUser();
  const alerts = await prisma.userAlert.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: {
      card: {
        select: { id: true, name: true, cardNumber: true, treatment: true },
      },
    },
  });
  return NextResponse.json({ data: alerts });
}

export async function POST(request: NextRequest) {
  const user = await requireUser();
  const body = await request.json();
  const parsed = createAlertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.issues }, { status: 400 });
  }

  const input = parsed.data;

  if (input.cardId) {
    const card = await prisma.card.findUnique({ where: { id: input.cardId } });
    if (!card) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }
  }

  const alert = await prisma.userAlert.create({
    data: {
      userId: user.id,
      type: input.type,
      cardId: input.cardId ?? null,
      thresholdPct: input.thresholdPct ?? null,
    },
  });

  return NextResponse.json({ data: alert }, { status: 201 });
}
