// Binder check-in / locking. Implements the PDF slide 9 + 13 rule that a
// Dragon Binder registered for an event is held from check-in until the
// event concludes — its scales can't be edited or used in the playable
// deck. Software side: we freeze the underlying DragonScale rows from
// further mutation and snapshot their points-at-lock for the post-event
// audit (declared ≤ actual).
//
// Scope of the lock:
// - USER dragon registration → lock every DragonScale owned by the user
//   at registration time
// - PACK dragon registration → lock every DragonScale owned by every
//   current pack member at registration time
//
// Scales added to a binder AFTER registration are NOT in the lock — they
// were never part of the registered binder. Same for scales added by a
// member who joined the pack post-lock.
//
// Auto-release happens when the event status moves to COMPLETED or
// CANCELLED. Withdrawing from the registration also releases (via
// onDelete: Cascade through TournamentBinderLock).

import { prisma } from "@/lib/prisma";
import type { PrismaClient } from "@/generated/prisma/client";

type Tx = PrismaClient | Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

/**
 * Snapshot the contributing scales for a registration into a
 * TournamentBinderLock + LockedScale set. Idempotent at the
 * registration level — if a lock already exists for this registration,
 * returns the existing one without re-snapshotting.
 *
 * Caller must pass the registrationId (the API route already has this
 * value); this helper does the rest.
 */
export async function lockBinderForRegistration(registrationId: string) {
  const existing = await prisma.tournamentBinderLock.findUnique({
    where: { tournamentRegistrationId: registrationId },
  });
  if (existing) return existing;

  const reg = await prisma.tournamentRegistration.findUnique({
    where: { id: registrationId },
    include: {
      dragon: {
        select: { ownerType: true, userOwnerId: true, packOwnerId: true },
      },
    },
  });
  if (!reg) throw new Error(`Registration ${registrationId} not found`);

  // Resolve the contributing user-id set.
  let userIds: string[] = [];
  if (reg.dragon.ownerType === "USER" && reg.dragon.userOwnerId) {
    userIds = [reg.dragon.userOwnerId];
  } else if (reg.dragon.ownerType === "PACK" && reg.dragon.packOwnerId) {
    const members = await prisma.huntingPackMember.findMany({
      where: { packId: reg.dragon.packOwnerId, leftAt: null },
      select: { userId: true },
    });
    userIds = members.map((m) => m.userId);
  }

  const scales = userIds.length
    ? await prisma.dragonScale.findMany({
        where: { userId: { in: userIds } },
        select: { id: true, pointsCached: true },
      })
    : [];
  const totalPoints = scales.reduce((s, x) => s + x.pointsCached, 0);

  return prisma.$transaction(async (tx) => {
    const lock = await tx.tournamentBinderLock.create({
      data: {
        tournamentRegistrationId: registrationId,
        declaredPointsAtLock: reg.declaredPoints,
        totalPointsAtLock: totalPoints,
      },
    });
    if (scales.length > 0) {
      await tx.lockedScale.createMany({
        data: scales.map((s) => ({
          binderLockId: lock.id,
          dragonScaleId: s.id,
          pointsAtLock: s.pointsCached,
        })),
      });
    }
    return lock;
  });
}

/**
 * Release every active lock for an event. Called when the event
 * transitions to COMPLETED or CANCELLED. Setting `releasedAt` is enough
 * to stop the lock from blocking scale mutations; the LockedScale rows
 * are kept for audit.
 */
export async function releaseBinderLocksForEvent(eventId: string, client: Tx = prisma) {
  await client.tournamentBinderLock.updateMany({
    where: {
      registration: { eventId },
      releasedAt: null,
    },
    data: { releasedAt: new Date() },
  });
}

/**
 * Lookup helper for the DragonScale CRUD guards. Returns the active
 * lock(s) blocking mutation of the given scale id, or an empty array
 * when the scale isn't locked.
 */
export async function activeLocksForScale(scaleId: string) {
  return prisma.lockedScale.findMany({
    where: {
      dragonScaleId: scaleId,
      binderLock: { releasedAt: null },
    },
    include: {
      binderLock: {
        include: {
          registration: {
            include: {
              event: { select: { id: true, name: true, slug: true, status: true } },
            },
          },
        },
      },
    },
  });
}
