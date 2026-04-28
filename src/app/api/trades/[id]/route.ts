import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { respondTradeSchema } from "@/lib/validators/trade";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await requireUser();

  const trade = await prisma.trade.findUnique({
    where: { id },
    include: {
      items: { include: { card: { select: { id: true, name: true, cardNumber: true } } } },
      proposer: { select: { id: true, username: true } },
      recipient: { select: { id: true, username: true } },
    },
  });
  if (!trade) {
    return NextResponse.json({ error: "Trade not found" }, { status: 404 });
  }
  if (trade.proposerId !== user.id && trade.recipientId !== user.id) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  return NextResponse.json({ data: trade });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await requireUser();
  const body = await request.json();
  const parsed = respondTradeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.issues }, { status: 400 });
  }

  const trade = await prisma.trade.findUnique({ where: { id } });
  if (!trade) {
    return NextResponse.json({ error: "Trade not found" }, { status: 404 });
  }
  if (trade.status !== "PROPOSED") {
    return NextResponse.json({ error: "Trade is not in a respondable state" }, { status: 409 });
  }

  const isProposer = trade.proposerId === user.id;
  const isRecipient = trade.recipientId === user.id;
  if (!isProposer && !isRecipient) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { action } = parsed.data;
  const now = new Date();

  if (action === "accept" && isRecipient) {
    const updated = await prisma.trade.update({
      where: { id },
      data: { status: "ACCEPTED", respondedAt: now },
    });
    return NextResponse.json({ data: updated });
  }
  if (action === "decline" && isRecipient) {
    const updated = await prisma.trade.update({
      where: { id },
      data: { status: "DECLINED", respondedAt: now },
    });
    return NextResponse.json({ data: updated });
  }
  if (action === "withdraw" && isProposer) {
    const updated = await prisma.trade.update({
      where: { id },
      data: { status: "WITHDRAWN", respondedAt: now },
    });
    return NextResponse.json({ data: updated });
  }

  return NextResponse.json({ error: "Invalid action for this user" }, { status: 403 });
}
