import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { appointRiderSchema } from "@/lib/validators/pack";

// Appoint or change the Dragon Rider on the current user's personal Dragon.
// For pack Dragons, the rider is named in the contract and changes require
// proposing + ratifying a new contract version — that path lives in
// /api/hunting-packs/[id]/contract/versions.
export async function POST(request: NextRequest) {
  const user = await requireUser();
  const body = await request.json();
  const parsed = appointRiderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const reg = await prisma.dragonRegistration.findUnique({
    where: { ownerType_userOwnerId: { ownerType: "USER", userOwnerId: user.id } },
  });
  if (!reg) {
    return NextResponse.json({ error: "No registered personal Dragon" }, { status: 404 });
  }

  const rider = await prisma.user.findUnique({
    where: { id: parsed.data.userId },
    select: { id: true },
  });
  if (!rider) {
    return NextResponse.json({ error: "Rider user not found" }, { status: 400 });
  }

  // PDF rule: a Stoneseeker can only ride one Dragon. Refuse if they're
  // already named on a different active registration. (Includes pack
  // Dragons.)
  const existingRide = await prisma.dragonRegistration.findFirst({
    where: {
      dragonRiderUserId: rider.id,
      dissolvedAt: null,
      NOT: { id: reg.id },
    },
    select: { id: true, ownerType: true },
  });
  if (existingRide) {
    return NextResponse.json(
      { error: "That Stoneseeker already rides another active Dragon" },
      { status: 409 },
    );
  }

  const updated = await prisma.dragonRegistration.update({
    where: { id: reg.id },
    data: { dragonRiderUserId: rider.id },
  });

  return NextResponse.json({ data: updated });
}

// Optional rider removal — body-less DELETE.
export async function DELETE() {
  const user = await requireUser();
  const reg = await prisma.dragonRegistration.findUnique({
    where: { ownerType_userOwnerId: { ownerType: "USER", userOwnerId: user.id } },
  });
  if (!reg) return NextResponse.json({ error: "No registered personal Dragon" }, { status: 404 });
  const updated = await prisma.dragonRegistration.update({
    where: { id: reg.id },
    data: { dragonRiderUserId: null },
  });
  return NextResponse.json({ data: updated });
}
