import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminUser, isCronAuthorized } from "@/lib/auth";
import {
  recalculatePackDragon,
  recalculateUserDragon,
} from "@/lib/dragon/recalculate";

// Sweep recalc for every Dragon registration. Useful after catalog-level
// changes that don't trigger per-scale recalc — Card.isStoneseeker /
// .isLoreMythic / rarity / treatment edits, or freshness-set list updates.
// Bounded by candidate counts so a single invocation has a known cost
// ceiling. CRON_TOKEN or admin auth.
export async function POST(request: NextRequest) {
  const cronOk = isCronAuthorized(request);
  if (!cronOk) {
    const admin = await getAdminUser();
    if (!admin) {
      return NextResponse.json(
        { error: "Admin or CRON_TOKEN required" },
        { status: 403 },
      );
    }
  }

  // Recompute every user with at least one DragonScale. Pack recalc fans
  // out automatically inside recalculateForUserAndPacks, but we call the
  // narrow recalculateUserDragon then the explicit pack pass so each user
  // and each pack is touched exactly once across the sweep.
  const userIds = (
    await prisma.dragonScale.findMany({
      select: { userId: true },
      distinct: ["userId"],
    })
  ).map((r) => r.userId);

  for (const userId of userIds) {
    await recalculateUserDragon(userId);
  }

  // Then every active pack (DISBANDED ones are intentionally skipped by
  // recalculatePackDragon).
  const packIds = (
    await prisma.huntingPack.findMany({
      where: { status: "ACTIVE" },
      select: { id: true },
    })
  ).map((p) => p.id);

  for (const packId of packIds) {
    await recalculatePackDragon(packId);
  }

  return NextResponse.json({
    data: {
      usersRecalculated: userIds.length,
      packsRecalculated: packIds.length,
    },
  });
}
