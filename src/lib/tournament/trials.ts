// Hunting Trials side-category computation. Per PDF slide 16:
//
//   * Top Dragon — single winner, most Dragon Points entered. Prize: 1/1
//     Stonefoil prize card.
//   * Top 10 Dragons — top 10 by entered points. Prize: 10-print Formless
//     Foil prize card per winner.
//   * Osprey Dragons (Specialists, Most Points Per Set) — top 3 by
//     per-set scale-points contribution within each set the event covers.
//     Prize: 3-print Formless Foil prize card per set.
//
// Top Dragon + Top 10 rank by declaredPoints (the value the hunter
// declared at registration; the audit safety margin from PDF slide 13
// applies). Osprey ranks by raw per-set scale-points contribution so
// specialisation reflects the actual binder, not the declared total.
//
// Pure compute — caller persists the result. Re-runnable; the persistence
// layer wipes prior TrialAward rows for the event before inserting fresh
// ones (same pattern as TournamentResult).

import { prisma } from "@/lib/prisma";

export interface TrialEntry {
  registrationId: string;
  rank: number;
  points: number;
}

export interface TrialResult {
  topDragon: TrialEntry | null;
  top10: TrialEntry[];
  osprey: Array<{ setCode: string; entries: TrialEntry[] }>;
}

const OSPREY_PER_SET_LIMIT = 3;
const TOP_N_LIMIT = 10;

/**
 * Compute the trial awards for an event. Returns a structured result with
 * one TOP_DRAGON winner (or null when there are no registrations), up to
 * 10 TOP_10 entries, and per-set OSPREY winners for every set that has
 * any contributing scale points across the event's registrations.
 */
export async function computeTrials(eventId: string): Promise<TrialResult> {
  const registrations = await prisma.tournamentRegistration.findMany({
    where: { eventId },
    select: {
      id: true,
      declaredPoints: true,
      dragonRegistrationId: true,
      dragon: {
        select: {
          ownerType: true,
          userOwnerId: true,
          packOwnerId: true,
        },
      },
    },
  });

  // Top Dragon + Top 10: rank by declaredPoints, ties broken by id for
  // determinism (no DB-supplied tie-breaker; deterministic so re-running
  // on the same data produces the same awards).
  const byDeclared = [...registrations].sort((a, b) => {
    if (b.declaredPoints !== a.declaredPoints) return b.declaredPoints - a.declaredPoints;
    return a.id.localeCompare(b.id);
  });

  const topDragon: TrialEntry | null =
    byDeclared.length > 0
      ? {
          registrationId: byDeclared[0].id,
          rank: 1,
          points: byDeclared[0].declaredPoints,
        }
      : null;

  const top10: TrialEntry[] = byDeclared.slice(0, TOP_N_LIMIT).map((r, i) => ({
    registrationId: r.id,
    rank: i + 1,
    points: r.declaredPoints,
  }));

  // Osprey: for each registration, sum scale points by Set.code. For USER
  // dragons that's the user's own scales; for PACK dragons it's all current
  // members' scales pooled (matching how the pack pool itself is computed).
  const perSetByReg = new Map<string, Map<string, number>>(); // regId → setCode → points

  for (const reg of registrations) {
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
    if (userIds.length === 0) continue;

    const groups = await prisma.dragonScale.groupBy({
      by: ["cardId"],
      where: { userId: { in: userIds } },
      _sum: { pointsCached: true },
    });
    if (groups.length === 0) continue;

    // Translate cardId → setCode in a single fetch.
    const cards = await prisma.card.findMany({
      where: { id: { in: groups.map((g) => g.cardId) } },
      select: { id: true, set: { select: { code: true } } },
    });
    const setByCard = new Map(cards.map((c) => [c.id, c.set.code]));

    const setSums = new Map<string, number>();
    for (const g of groups) {
      const setCode = setByCard.get(g.cardId);
      if (!setCode) continue;
      setSums.set(setCode, (setSums.get(setCode) ?? 0) + (g._sum.pointsCached ?? 0));
    }
    perSetByReg.set(reg.id, setSums);
  }

  // Pivot: setCode → list of (regId, points), ranked.
  const allSets = new Set<string>();
  for (const sums of perSetByReg.values()) {
    for (const s of sums.keys()) allSets.add(s);
  }

  const osprey: Array<{ setCode: string; entries: TrialEntry[] }> = [];
  for (const setCode of [...allSets].sort()) {
    const candidates: Array<{ registrationId: string; points: number }> = [];
    for (const [regId, sums] of perSetByReg.entries()) {
      const p = sums.get(setCode) ?? 0;
      if (p > 0) candidates.push({ registrationId: regId, points: p });
    }
    candidates.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      return a.registrationId.localeCompare(b.registrationId);
    });
    const entries = candidates.slice(0, OSPREY_PER_SET_LIMIT).map((c, i) => ({
      registrationId: c.registrationId,
      rank: i + 1,
      points: c.points,
    }));
    if (entries.length > 0) osprey.push({ setCode, entries });
  }

  return { topDragon, top10, osprey };
}

/**
 * Persist a TrialResult by replacing all existing TrialAward rows for the
 * event. Idempotent: re-running on the same data yields the same rows.
 */
export async function persistTrials(eventId: string, result: TrialResult) {
  await prisma.$transaction(async (tx) => {
    await tx.trialAward.deleteMany({ where: { eventId } });

    if (result.topDragon) {
      await tx.trialAward.create({
        data: {
          eventId,
          registrationId: result.topDragon.registrationId,
          kind: "TOP_DRAGON",
          rank: 1,
          points: result.topDragon.points,
        },
      });
    }

    if (result.top10.length > 0) {
      await tx.trialAward.createMany({
        data: result.top10.map((e) => ({
          eventId,
          registrationId: e.registrationId,
          kind: "TOP_10" as const,
          rank: e.rank,
          points: e.points,
        })),
      });
    }

    for (const setBlock of result.osprey) {
      await tx.trialAward.createMany({
        data: setBlock.entries.map((e) => ({
          eventId,
          registrationId: e.registrationId,
          kind: "OSPREY" as const,
          setCode: setBlock.setCode,
          rank: e.rank,
          points: e.points,
        })),
      });
    }
  });
}
