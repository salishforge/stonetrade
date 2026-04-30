import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { updateDragonScaleSchema } from "@/lib/validators/dragon";
import { recalculateForUserAndPacks } from "@/lib/dragon/recalculate";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  const { id } = await params;
  const body = await request.json();
  const parsed = updateDragonScaleSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const existing = await prisma.dragonScale.findUnique({
    where: { id },
    include: { card: { select: { isToken: true } } },
  });
  if (!existing || existing.userId !== user.id) {
    return NextResponse.json({ error: "Dragon scale not found" }, { status: 404 });
  }

  const input = parsed.data;
  const bonusVariant = existing.card.isToken ? "NONE" : input.bonusVariant;

  await prisma.dragonScale.update({
    where: { id },
    data: {
      bonusVariant: bonusVariant ?? undefined,
      quantity: input.quantity ?? undefined,
      serialNumber: input.serialNumber === undefined ? undefined : input.serialNumber,
      notes: input.notes === undefined ? undefined : input.notes,
    },
  });

  await recalculateForUserAndPacks(user.id);

  const fresh = await prisma.dragonScale.findUniqueOrThrow({
    where: { id },
    include: {
      card: {
        select: {
          id: true,
          name: true,
          cardNumber: true,
          rarity: true,
          treatment: true,
          imageUrl: true,
          isStoneseeker: true,
          isLoreMythic: true,
          isToken: true,
          set: { select: { code: true, name: true } },
        },
      },
    },
  });

  return NextResponse.json({ data: fresh });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  const { id } = await params;

  const existing = await prisma.dragonScale.findUnique({ where: { id } });
  if (!existing || existing.userId !== user.id) {
    return NextResponse.json({ error: "Dragon scale not found" }, { status: 404 });
  }

  await prisma.dragonScale.delete({ where: { id } });
  await recalculateForUserAndPacks(user.id);

  return NextResponse.json({ data: { id } });
}
