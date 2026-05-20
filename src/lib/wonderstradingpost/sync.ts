/**
 * Wonders Trading Post → PriceDataPoint ingestion.
 *
 * Pulls completed sales from wonderstradingpost.com's public Supabase
 * `listings` table (status='sold') and persists them as `WONDERSTRADINGPOST`
 * data points. Idempotent via `wonderstradingpostListingId` — re-running
 * skips already-stored UUIDs.
 *
 * Treatment + condition vocabularies differ from ours. Mappers below
 * convert. Unmatched values are skipped (not silently coerced) so we
 * don't pollute the price aggregate with mis-bucketed data.
 *
 * Card identity match is `(card_name, set, treatment)` against our `Card`
 * table — both vocabularies use the same set names ("Call of the Stones",
 * "Existence"), and after treatment mapping the join is exact.
 */
import { prisma } from "@/lib/prisma";
import { fetchSoldListings, type WtpSoldListing } from "./client";
import { recalculateCardValue } from "@/lib/pricing/recalculate";

/**
 * Map wonderstradingpost's treatment vocabulary to ours.
 *
 * WTP observed values: "Formless Foil", "Paper", "OCM", "Classic Foil",
 * plus "Stonefoil" / "Inspired Ink Auto" / "Base" / "Superfoil" not seen
 * in current data but listed in our Card.treatment domain.
 *
 * Only "Paper" needs renaming — everything else is already named the same.
 */
const TREATMENT_MAP: Record<string, string> = {
  Paper: "Classic Paper",
  "Classic Paper": "Classic Paper",
  "Classic Foil": "Classic Foil",
  "Formless Foil": "Formless Foil",
  OCM: "OCM",
  Stonefoil: "Stonefoil",
  Superfoil: "Superfoil",
  Base: "Base",
  "Inspired Ink Auto": "Inspired Ink Auto",
};

type Condition =
  | "MINT"
  | "NEAR_MINT"
  | "LIGHTLY_PLAYED"
  | "MODERATELY_PLAYED"
  | "HEAVILY_PLAYED"
  | "DAMAGED";

/**
 * Map wonderstradingpost's condition string to our `CardCondition` enum.
 * Only "Mint" and "Near Mint" appear in current data — the rest are
 * defensive so an unexpected value doesn't crash the sync.
 */
const CONDITION_MAP: Record<string, Condition> = {
  Mint: "MINT",
  "Near Mint": "NEAR_MINT",
  "Lightly Played": "LIGHTLY_PLAYED",
  "Moderately Played": "MODERATELY_PLAYED",
  "Heavily Played": "HEAVILY_PLAYED",
  Damaged: "DAMAGED",
};

export interface WtpSyncResult {
  rowsFetched: number;
  pricesAdded: number;
  skippedUnmatched: number;
  skippedDuplicate: number;
  skippedInvalid: number;
  errors: Array<{ listingId: string; message: string }>;
}

/**
 * Run the sync. Optionally restrict to listings updated after `since` so
 * incremental cron jobs don't refetch the full history every time.
 */
export async function syncWonderstradingpost(opts: { since?: Date } = {}): Promise<WtpSyncResult> {
  const result: WtpSyncResult = {
    rowsFetched: 0,
    pricesAdded: 0,
    skippedUnmatched: 0,
    skippedDuplicate: 0,
    skippedInvalid: 0,
    errors: [],
  };

  const rows = await fetchSoldListings({ since: opts.since });
  result.rowsFetched = rows.length;
  if (rows.length === 0) return result;

  // Bulk dedupe: pull every existing WTP listing id touched by the current
  // batch in one query, build a Set, skip locally. Avoids 145 sequential
  // findFirst queries on the cold path.
  const existing = await prisma.priceDataPoint.findMany({
    where: {
      source: "WONDERSTRADINGPOST",
      wonderstradingpostListingId: { in: rows.map((r) => r.id) },
    },
    select: { wonderstradingpostListingId: true },
  });
  const seen = new Set(existing.map((r) => r.wonderstradingpostListingId).filter(Boolean));

  const touchedCardIds = new Set<string>();

  for (const row of rows) {
    if (seen.has(row.id)) {
      result.skippedDuplicate++;
      continue;
    }

    const treatment = TREATMENT_MAP[row.treatment];
    const condition = CONDITION_MAP[row.condition];
    if (!treatment || !condition) {
      result.skippedInvalid++;
      continue;
    }
    if (!(row.price > 0) || !isFinite(row.price)) {
      result.skippedInvalid++;
      continue;
    }

    const card = await matchCard(row, treatment);
    if (!card) {
      result.skippedUnmatched++;
      continue;
    }

    try {
      await prisma.priceDataPoint.create({
        data: {
          cardId: card.id,
          source: "WONDERSTRADINGPOST",
          price: row.price,
          condition,
          treatment,
          wonderstradingpostListingId: row.id,
          // External marketplace, not buyer-verified by us. The pricing
          // engine still trusts WTP because it's a real transaction —
          // the `verified` flag is reserved for internal COMPLETED_SALE
          // rows we own end-to-end.
          verified: false,
          createdAt: new Date(row.updated_at),
        },
      });
      result.pricesAdded++;
      touchedCardIds.add(card.id);
    } catch (err) {
      result.errors.push({
        listingId: row.id,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Recompute market values for every card that received a new data point.
  // Wrapped per-card so a single recompute failure doesn't poison the rest.
  for (const cardId of touchedCardIds) {
    try {
      await recalculateCardValue(cardId);
    } catch (err) {
      result.errors.push({
        listingId: cardId,
        message: `recalculate failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  return result;
}

/**
 * Resolve a WTP row to one of our Card rows. Match key is
 * `(card_name, set.name, treatment)`. Falls back to `(card_name, set.name)`
 * if no treatment-specific row exists (shouldn't happen for wotf since
 * every card has all five treatments, but the fallback is cheap insurance
 * against catalog gaps).
 */
async function matchCard(row: WtpSoldListing, treatment: string) {
  const exact = await prisma.card.findFirst({
    where: {
      name: row.card_name,
      treatment,
      set: { name: row.set },
    },
    select: { id: true },
  });
  if (exact) return exact;

  return prisma.card.findFirst({
    where: {
      name: row.card_name,
      set: { name: row.set },
    },
    select: { id: true },
  });
}
