import { prisma } from "@/lib/prisma";
import { fetchAllCards, fetchCardStats } from "./client";
import { computePRI, type PRIInputs } from "@/lib/engine/pri";

/**
 * Apply the same cardNumber transformation that mapper.ts uses when seeding
 * cards from the platform. Without this the local Card lookup misses every
 * card that wasn't already encoded as "X/401" upstream.
 */
function toLocalCardNumber(platformCardNumber: string): string {
  return platformCardNumber.includes("/")
    ? platformCardNumber
    : `${platformCardNumber}/401`;
}

interface SyncResult {
  fetched: number;
  matched: number;
  upserted: number;
}

/**
 * Pulls per-card play statistics from the Deck DB service and dbsScore from
 * the Card DB service, joins them to local cards, computes PRI, and upserts
 * CardEngineMetrics rows. Cards that aren't matched locally are skipped (the
 * card-sync hasn't run, or they're from a different game).
 *
 * winRateWhenIncluded is null when the platform reports no games played yet
 * (avg_win_rate uniformly 0 with no signal). PRI then drops that axis from
 * the weighted average and lowers confidence.
 *
 * Pass `format` to scope the deck-stats aggregation to one tournament format;
 * leaving it undefined aggregates across all formats.
 */
export async function syncEngineMetrics(opts: { format?: string } = {}): Promise<SyncResult> {
  const stats = await fetchCardStats({ format_name: opts.format, limit: 2000 });
  const platformCards = await fetchAllCards();

  // Index dbsScore by raw platform card_number for fast lookup.
  const dbsByCardNumber = new Map<string, number | null>();
  for (const c of platformCards) {
    dbsByCardNumber.set(c.card_number, c.dbs_score);
  }

  const winRateUnavailable = stats.cards.every((c) => c.avg_win_rate === 0);
  const inclusionDenominator = stats.decks_total;

  let upserted = 0;
  let matched = 0;
  for (const stat of stats.cards) {
    const localCardNumber = toLocalCardNumber(stat.card_number);

    // Local Card uniqueness is (setId, cardNumber, treatment); the platform
    // doesn't know about treatments, so the same gameplay card has multiple
    // treatment variants in stonetrade. Engine metrics are per "base card
    // identity", so we resolve to all variants sharing the cardNumber and
    // upsert once per cardId. PLANNING.md §4.1 calls this out explicitly.
    const localCards = await prisma.card.findMany({
      where: { cardNumber: localCardNumber },
      select: { id: true },
    });
    if (localCards.length === 0) continue;
    matched++;

    const deckInclusionPct =
      inclusionDenominator > 0
        ? (stat.decks_containing / inclusionDenominator) * 100
        : null;

    const winRateWhenIncluded = winRateUnavailable ? null : stat.avg_win_rate * 100;

    const avgCopiesPlayed = stat.decks_containing > 0 ? stat.avg_copies_when_included : null;

    const dbsScore = dbsByCardNumber.get(stat.card_number) ?? null;

    // replacementRate stays null until the strategy engine exposes
    // counterfactual analysis. PRI drops null axes from the weighted average.
    const priInputs: PRIInputs = {
      dbsScore,
      deckInclusionPct,
      winRateWhenIncluded,
      avgCopiesPlayed,
      replacementRate: null,
    };
    const { pri, confidence } = computePRI(priInputs);

    for (const card of localCards) {
      await prisma.cardEngineMetrics.upsert({
        where: { cardId: card.id },
        update: {
          dbsScore,
          deckInclusionPct,
          winRateWhenIncluded,
          avgCopiesPlayed,
          replacementRate: null,
          pri,
          priConfidence: confidence,
          format: opts.format ?? null,
          lastSyncedAt: new Date(),
        },
        create: {
          cardId: card.id,
          dbsScore,
          deckInclusionPct,
          winRateWhenIncluded,
          avgCopiesPlayed,
          replacementRate: null,
          pri,
          priConfidence: confidence,
          format: opts.format ?? null,
        },
      });
      // Append a PRI snapshot. Append-only — alert evaluator reads recent
      // history to detect META_SHIFT (sustained PRI changes).
      await prisma.cardEngineMetricsHistory.create({
        data: { cardId: card.id, pri, priConfidence: confidence },
      });
      upserted++;
    }
  }

  return {
    fetched: stats.cards.length,
    matched,
    upserted,
  };
}
