// DB-touching recalculation entry points for Dragon Cup Phase 1.
//
// `recalculateUserDragon` is the source of truth for a user's Dragon strength
// — it walks every scale the user owns, recomputes per-row points, writes
// them back, and upserts a DragonRegistration row when total points cross
// the threshold (or marks an existing one dissolved when it drops below).
// `recalculateScale` is the per-mutation helper API routes call after every
// write, and just delegates to `recalculateUserDragon` after refreshing the
// touched row's denormalised treatment field.
//
// Recalc is synchronous on every write — Phase 1 does not need a worker.
// If scale counts grow large per user, this is the function to optimise
// (batch-fetch with one cards include + a single UPDATE … FROM statement).

import { prisma } from "@/lib/prisma";
import { scoreScale } from "./score-scale";
import { DRAGON_POINT_THRESHOLD } from "./constants";

/**
 * Recompute every Dragon Scale owned by `userId`, write back per-scale
 * cached points, and reconcile the personal DragonRegistration row.
 *
 * Returns the registration row when one is currently active, the dissolved
 * row when the user previously formed a Dragon and has now dropped below
 * the threshold, or null when the user has never formed one.
 */
export async function recalculateUserDragon(userId: string) {
  const scales = await prisma.dragonScale.findMany({
    where: { userId },
    include: {
      card: {
        select: {
          id: true,
          rarity: true,
          isStoneseeker: true,
          isLoreMythic: true,
          isToken: true,
          set: { select: { code: true } },
        },
      },
    },
  });

  const now = new Date();
  let totalPoints = 0;

  for (const scale of scales) {
    const breakdown = scoreScale(
      {
        treatment: scale.treatment,
        bonusVariant: scale.bonusVariant,
        quantity: scale.quantity,
      },
      scale.card,
    );

    if (breakdown.total !== scale.pointsCached) {
      await prisma.dragonScale.update({
        where: { id: scale.id },
        data: { pointsCached: breakdown.total, pointsCalculatedAt: now },
      });
    }

    totalPoints += breakdown.total;
  }

  const existing = await prisma.dragonRegistration.findUnique({
    where: { ownerType_userOwnerId: { ownerType: "USER", userOwnerId: userId } },
  });

  if (totalPoints >= DRAGON_POINT_THRESHOLD) {
    if (existing) {
      return prisma.dragonRegistration.update({
        where: { id: existing.id },
        data: {
          currentPoints: totalPoints,
          // Re-forming a previously dissolved Dragon clears the dissolution
          // marker but preserves the original formedAt — the Dragon's
          // history is one continuous identity.
          dissolvedAt: null,
          lastRecalculatedAt: now,
        },
      });
    }
    return prisma.dragonRegistration.create({
      data: {
        ownerType: "USER",
        userOwnerId: userId,
        currentPoints: totalPoints,
        formedAt: now,
        lastRecalculatedAt: now,
      },
    });
  }

  // Below threshold. Mark dissolved if it was active; otherwise nothing to do.
  if (existing && existing.dissolvedAt == null) {
    return prisma.dragonRegistration.update({
      where: { id: existing.id },
      data: {
        currentPoints: totalPoints,
        dissolvedAt: now,
        lastRecalculatedAt: now,
      },
    });
  }
  if (existing) {
    return prisma.dragonRegistration.update({
      where: { id: existing.id },
      data: { currentPoints: totalPoints, lastRecalculatedAt: now },
    });
  }
  return null;
}

/**
 * Convenience wrapper for API routes mutating a single scale: locates the
 * scale's owner and recalculates them. Returns the same shape as
 * `recalculateUserDragon`.
 */
export async function recalculateScale(scaleId: string) {
  const scale = await prisma.dragonScale.findUnique({
    where: { id: scaleId },
    select: { userId: true },
  });
  if (!scale) return null;
  return recalculateUserDragon(scale.userId);
}
