import { prisma } from "@/lib/prisma";
import { explainMovement, type Attribution } from "@/lib/attribution/explain";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
const TWENTY_ONE_DAYS_MS = 21 * 24 * 60 * 60 * 1000;
const TOURNAMENT_LOOKBACK_MS = 21 * 24 * 60 * 60 * 1000;

interface LoadInput {
  cardId: string;
  trend7d: number | null;
  scarcityTier: string | null;
  totalAvailable: number;
  totalWanted: number;
  priCurrent: number | null;
  now?: Date;
}

/**
 * Fetch the auxiliary data the attribution engine needs and run it. Done as
 * a thin loader (not inline in the page) so the page stays a presentation
 * layer and so we can mock the loader in component tests later.
 *
 * Returns null when there's truly nothing to attribute — caller can choose to
 * hide the panel rather than render "Quiet week" if that's preferable.
 */
export async function loadCardAttribution(input: LoadInput): Promise<Attribution> {
  const now = input.now ?? new Date();
  const sevenDaysAgo = new Date(now.getTime() - SEVEN_DAYS_MS);
  const fourteenDaysAgo = new Date(now.getTime() - FOURTEEN_DAYS_MS);
  const tournamentLookback = new Date(now.getTime() - TOURNAMENT_LOOKBACK_MS);

  const [recentSales, priorSales, priPriorSnapshot, tournaments] = await Promise.all([
    prisma.priceDataPoint.count({
      where: {
        cardId: input.cardId,
        source: { in: ["COMPLETED_SALE", "EBAY_SOLD"] },
        createdAt: { gte: sevenDaysAgo },
      },
    }),
    prisma.priceDataPoint.count({
      where: {
        cardId: input.cardId,
        source: { in: ["COMPLETED_SALE", "EBAY_SOLD"] },
        createdAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo },
      },
    }),
    // Most recent PRI snapshot ≥7 days old. Mirrors the alert evaluator's
    // META_SHIFT comparison so both surfaces tell the same story.
    prisma.cardEngineMetricsHistory.findFirst({
      where: { cardId: input.cardId, capturedAt: { lte: sevenDaysAgo } },
      orderBy: { capturedAt: "desc" },
      select: { pri: true },
    }),
    // Tournament events that have wrapped recently. Schema doesn't link
    // events to cards, so this is a temporal correlation only — the
    // attribution engine knows to phrase it as "Following X" rather than
    // claiming causation.
    prisma.tournamentEvent.findMany({
      where: {
        status: "COMPLETED",
        eventDate: { gte: tournamentLookback, lte: now },
      },
      select: { name: true, eventDate: true },
      orderBy: { eventDate: "desc" },
      take: 5,
    }),
  ]);

  return explainMovement({
    trend7d: input.trend7d,
    scarcityTier: input.scarcityTier,
    totalAvailable: input.totalAvailable,
    totalWanted: input.totalWanted,
    priCurrent: input.priCurrent,
    priPrior: priPriorSnapshot?.pri ?? null,
    recentSales7d: recentSales,
    priorSales7d: priorSales,
    recentTournaments: tournaments.map((t) => ({ name: t.name, eventDate: t.eventDate })),
    now,
  });
}

// Keeping unused imports out of the way — these constants are re-exported
// for tests and future callers that want to set their own windows.
export const ATTRIBUTION_WINDOWS = {
  recent: SEVEN_DAYS_MS,
  prior: FOURTEEN_DAYS_MS,
  tournament: TWENTY_ONE_DAYS_MS,
};
