/**
 * eBay → PriceDataPoint ingestion pipeline.
 *
 * Iterates a set of cards, queries eBay Browse (active listings) and
 * optionally Marketplace Insights (sold items), and persists the results
 * as `PriceDataPoint` rows scoped to the matching card.
 *
 * Idempotency: every persisted row carries `ebayListingId`. Subsequent
 * runs skip listings whose id is already stored under the same source.
 *
 * Recompute: after a successful per-card pull, the card's
 * `CardMarketValue` is recomputed via the existing pricing pipeline.
 */
import { prisma } from "@/lib/prisma";
import {
  searchActiveListings,
  searchSoldItems,
  isEbayConfigured,
  type EbayItem,
} from "./client";
import { recalculateCardValue } from "@/lib/pricing/recalculate";

const MIN_PRICE_USD = 0.5;
const MAX_PRICE_USD = 50_000;
const DEFAULT_PER_CARD_LIMIT = 25;

export interface CardForSync {
  id: string;
  name: string;
  cardNumber: string;
  treatment: string;
  setName: string;
  gameName: string;
  gameSlug: string;
}

export interface EbaySyncResult {
  cardsScanned: number;
  listedAdded: number;
  soldAdded: number;
  errors: Array<{ cardId: string; phase: "listed" | "sold"; message: string }>;
}

type Condition =
  | "MINT"
  | "NEAR_MINT"
  | "LIGHTLY_PLAYED"
  | "MODERATELY_PLAYED"
  | "HEAVILY_PLAYED"
  | "DAMAGED";

// eBay full-text search returns 0 hits for queries that include card-number
// suffixes like "CotS_314/401" — sellers don't put set-prefixed numbers in
// titles. Set name is what they actually use (e.g. "Call of the Stones").
function buildQuery(card: CardForSync): string {
  return `${card.name} ${card.setName}`.replace(/\s+/g, " ").trim();
}

const STOPWORDS = new Set(["the", "of", "and", "a", "an", "for"]);

function significantTokens(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

// Reject items whose title doesn't plausibly match the card. Without this,
// a query like "Awakened Star Blossom" returns lipstick and Star Wars
// t-shirts alongside the one real card listing — and our pipeline would
// happily write those prices into PriceDataPoint.
//
// Match rule: every significant word of the card name must appear in the
// title, AND at least one game/set identifier must appear (so a generic
// match like "Star Blossom" on an unrelated product is rejected).
function isLikelyMatch(title: string, card: CardForSync): boolean {
  const t = title.toLowerCase();
  const nameWords = significantTokens(card.name);
  if (nameWords.length > 0 && !nameWords.every((w) => t.includes(w))) {
    return false;
  }
  const gameSetWords = [
    ...significantTokens(card.gameName),
    ...significantTokens(card.setName),
    card.gameSlug.toLowerCase(),
  ].filter((w) => w.length >= 4);
  if (gameSetWords.length === 0) return true;
  return gameSetWords.some((w) => t.includes(w));
}

function mapCondition(ebayCondition: string | null): Condition {
  if (!ebayCondition) return "NEAR_MINT";
  const c = ebayCondition.toLowerCase();
  if (c.includes("new") || c.includes("mint")) return "NEAR_MINT";
  if (c.includes("excellent") || c.includes("like new")) return "NEAR_MINT";
  if (c.includes("very good")) return "LIGHTLY_PLAYED";
  if (c.includes("good")) return "MODERATELY_PLAYED";
  if (c.includes("acceptable")) return "HEAVILY_PLAYED";
  return "NEAR_MINT";
}

function priceInRange(item: EbayItem): boolean {
  return (
    Number.isFinite(item.price) &&
    item.price >= MIN_PRICE_USD &&
    item.price <= MAX_PRICE_USD &&
    item.currency === "USD"
  );
}

async function persistItem(
  card: CardForSync,
  source: "EBAY_LISTED" | "EBAY_SOLD",
  item: EbayItem
): Promise<boolean> {
  if (!item.itemId || !priceInRange(item)) return false;
  if (!isLikelyMatch(item.title, card)) return false;

  const existing = await prisma.priceDataPoint.findFirst({
    where: { source, ebayListingId: item.itemId },
    select: { id: true },
  });
  if (existing) return false;

  await prisma.priceDataPoint.create({
    data: {
      cardId: card.id,
      source,
      price: item.price,
      condition: mapCondition(item.condition),
      treatment: card.treatment,
      ebayListingId: item.itemId,
      ebayItemUrl: item.itemUrl || null,
      verified: source === "EBAY_SOLD",
      createdAt: item.date ? new Date(item.date) : undefined,
    },
  });
  return true;
}

/**
 * Run the eBay sync for an explicit list of cards.
 */
export async function syncEbayPricesForCards(
  cards: CardForSync[],
  options: { includeSold?: boolean; perCardLimit?: number } = {}
): Promise<EbaySyncResult> {
  if (!isEbayConfigured()) {
    throw new Error("eBay is not configured. Set EBAY_APP_ID and EBAY_CERT_ID.");
  }

  const limit = options.perCardLimit ?? DEFAULT_PER_CARD_LIMIT;
  const result: EbaySyncResult = { cardsScanned: 0, listedAdded: 0, soldAdded: 0, errors: [] };
  const touchedCardIds = new Set<string>();

  for (const card of cards) {
    result.cardsScanned++;
    const query = buildQuery(card);

    try {
      const active = await searchActiveListings(query, { limit });
      for (const item of active) {
        const added = await persistItem(card, "EBAY_LISTED", item);
        if (added) {
          result.listedAdded++;
          touchedCardIds.add(card.id);
        }
      }
    } catch (err) {
      result.errors.push({
        cardId: card.id,
        phase: "listed",
        message: (err as Error).message,
      });
    }

    if (options.includeSold) {
      try {
        const sold = await searchSoldItems(query, { limit, daysBack: 90 });
        for (const item of sold) {
          const added = await persistItem(card, "EBAY_SOLD", item);
          if (added) {
            result.soldAdded++;
            touchedCardIds.add(card.id);
          }
        }
      } catch (err) {
        result.errors.push({
          cardId: card.id,
          phase: "sold",
          message: (err as Error).message,
        });
      }
    }
  }

  for (const cardId of touchedCardIds) {
    try {
      await recalculateCardValue(cardId);
    } catch (err) {
      result.errors.push({
        cardId,
        phase: "listed",
        message: `recalculate: ${(err as Error).message}`,
      });
    }
  }

  return result;
}

/**
 * Run the eBay sync across every card in a game (filtered by set, optional).
 * Cards without listings are still scanned — they may have eBay activity.
 */
export async function syncEbayPricesForGame(
  gameSlug: string,
  options: { setCode?: string; includeSold?: boolean; perCardLimit?: number } = {}
): Promise<EbaySyncResult> {
  const rows = await prisma.card.findMany({
    where: {
      game: { slug: gameSlug },
      ...(options.setCode ? { set: { code: options.setCode } } : {}),
    },
    select: {
      id: true,
      name: true,
      cardNumber: true,
      treatment: true,
      set: { select: { name: true } },
      game: { select: { name: true, slug: true } },
    },
  });
  const cards: CardForSync[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    cardNumber: r.cardNumber,
    treatment: r.treatment,
    setName: r.set.name,
    gameName: r.game.name,
    gameSlug: r.game.slug,
  }));
  return syncEbayPricesForCards(cards, options);
}
