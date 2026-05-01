import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { registerDragonSchema } from "@/lib/validators/tournament";
import { lockBinderForRegistration } from "@/lib/tournament/binder-lock";

// Register a Dragon for a tournament. Requirements:
//   * Caller must own the Dragon (USER ownerType = the caller; PACK owner
//     type = caller is a current member of the pack).
//   * The Dragon must currently have a non-null currentPoints ≥ threshold
//     (be active in the Stable; we accept the registration even if it
//     subsequently dissolves — declaredPoints is captured here).
//   * For pack Dragons, the contract must be RATIFIED so a rider has been
//     fully approved by all parties.
//   * declaredPoints ≤ currentPoints (declaring more than the binder
//     contains is a disqualification risk — don't allow).
//   * Per-event uniqueness on rider and on Dragon is enforced by DB
//     constraints; a rider can only ride one Dragon per event.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const user = await requireUser();
  const { slug } = await params;
  const body = await request.json();
  const parsed = registerDragonSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const event = await prisma.tournamentEvent.findUnique({ where: { slug } });
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });
  if (event.status !== "REGISTRATION_OPEN") {
    return NextResponse.json(
      { error: "Registration is not open for this event" },
      { status: 400 },
    );
  }

  const dragon = await prisma.dragonRegistration.findUnique({
    where: { id: parsed.data.dragonRegistrationId },
    include: {
      packOwner: {
        include: {
          members: { where: { leftAt: null } },
          contract: true,
        },
      },
    },
  });
  if (!dragon) return NextResponse.json({ error: "Dragon not found" }, { status: 404 });
  if (dragon.dissolvedAt) {
    return NextResponse.json({ error: "Dragon is dissolved" }, { status: 400 });
  }

  // Ownership check.
  if (dragon.ownerType === "USER") {
    if (dragon.userOwnerId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else if (dragon.ownerType === "PACK") {
    const isMember = dragon.packOwner?.members.some((m) => m.userId === user.id);
    if (!isMember) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (dragon.packOwner?.contract?.status !== "RATIFIED") {
      return NextResponse.json(
        { error: "Pack contract must be ratified before tournament registration" },
        { status: 400 },
      );
    }
  }

  if (parsed.data.declaredPoints > dragon.currentPoints) {
    return NextResponse.json(
      { error: "Declared points cannot exceed current binder strength" },
      { status: 400 },
    );
  }

  const rider = await prisma.user.findUnique({
    where: { id: parsed.data.dragonRiderUserId },
    select: { id: true },
  });
  if (!rider) return NextResponse.json({ error: "Rider user not found" }, { status: 400 });

  // For pack Dragons, the rider must match the rider named on the
  // ratified contract. For personal Dragons the rider must match the
  // appointed dragonRiderUserId. Both checks reject silent rider swap.
  if (dragon.dragonRiderUserId && dragon.dragonRiderUserId !== parsed.data.dragonRiderUserId) {
    return NextResponse.json(
      { error: "Rider does not match the Dragon's appointed rider" },
      { status: 400 },
    );
  }

  try {
    const reg = await prisma.tournamentRegistration.create({
      data: {
        eventId: event.id,
        dragonRegistrationId: dragon.id,
        dragonRiderUserId: parsed.data.dragonRiderUserId,
        declaredPoints: parsed.data.declaredPoints,
      },
    });
    // Snapshot the binder. Per PDF slides 9 + 13, the registered binder
    // is held until event end; the contributing scales become read-only.
    await lockBinderForRegistration(reg.id);
    return NextResponse.json({ data: reg }, { status: 201 });
  } catch (e) {
    // P2002 — uniqueness violation on (event, dragon) or (event, rider).
    const err = e as { code?: string };
    if (err.code === "P2002") {
      return NextResponse.json(
        { error: "That Dragon or Rider is already registered for this event" },
        { status: 409 },
      );
    }
    throw e;
  }
}
