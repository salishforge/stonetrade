import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { updateDragonScaleSchema } from "@/lib/validators/dragon";
import { recalculateForUserAndPacks } from "@/lib/dragon/recalculate";
import { activeLocksForScale } from "@/lib/tournament/binder-lock";

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
    include: { card: { select: { isToken: true, treatment: true } } },
  });
  if (!existing || existing.userId !== user.id) {
    return NextResponse.json({ error: "Dragon scale not found" }, { status: 404 });
  }

  // Binder lock: while the scale is part of an active TournamentBinderLock
  // (registration is open and event hasn't completed), no mutations are
  // permitted — the binder snapshot is the authoritative pre-event state
  // for the audit.
  const locks = await activeLocksForScale(id);
  if (locks.length > 0) {
    const ev = locks[0].binderLock.registration.event;
    return NextResponse.json(
      {
        error: `This scale is locked by your registration for "${ev.name}" (${ev.slug}). It can be modified again after the event concludes.`,
      },
      { status: 409 },
    );
  }

  const input = parsed.data;
  const bonusVariant = existing.card.isToken ? "NONE" : input.bonusVariant;

  // Stonefoil 1/1: refuse to bump quantity above 1 even on update.
  if (existing.card.treatment === "Stonefoil" && input.quantity != null && input.quantity > 1) {
    return NextResponse.json(
      { error: "Stonefoil cards are 1/1 — quantity must be 1" },
      { status: 400 },
    );
  }

  await prisma.dragonScale.update({
    where: { id },
    data: {
      bonusVariant: bonusVariant ?? undefined,
      quantity: input.quantity ?? undefined,
      serialNumber: input.serialNumber === undefined ? undefined : input.serialNumber,
      notes: input.notes === undefined ? undefined : input.notes,
      visibility: input.visibility ?? undefined,
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

  const locks = await activeLocksForScale(id);
  if (locks.length > 0) {
    const ev = locks[0].binderLock.registration.event;
    return NextResponse.json(
      {
        error: `This scale is locked by your registration for "${ev.name}" (${ev.slug}). Cannot remove until the event concludes.`,
      },
      { status: 409 },
    );
  }

  await prisma.dragonScale.delete({ where: { id } });
  await recalculateForUserAndPacks(user.id);

  return NextResponse.json({ data: { id } });
}
