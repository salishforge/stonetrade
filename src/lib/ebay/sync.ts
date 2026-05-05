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

// Single-token names under 6 chars (e.g. "Copy", "Punish", "The Mind" → "mind")
// have signal-to-noise too low to query usefully. eBay returns dozens of
// unrelated products that share the word AND the set name (which sellers use
// generically). Skip the request entirely rather than ingest junk.
function isQueryWorthwhile(card: CardForSync): boolean {
  const nameWords = significantTokens(card.name);
  if (nameWords.length === 0) return false;
  if (nameWords.length === 1 && nameWords[0].length < 6) return false;
  return true;
}

// Whole-word match. Substring matching falsely passes "wonder" against
// "Wonders of the First", so a card named "Wonder Token" matched every
// Wonders-of-the-First token listing. Word boundaries fix that.
function containsWord(title: string, word: string): boolean {
  return new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(
    title
  );
}

// Reject items whose title doesn't plausibly match the card.
//
// Match rule:
//   1. Every significant word of the card name appears in the title as a
//      whole word (word-boundary, case-insensitive).
//   2. The title contains a STRONG game identifier — the game slug or a
//      game-name token of length >= 6. Set names are NOT sufficient: words
//      like "Existence" or "Stones" appear constantly on unrelated listings,
//      and pairing them with a short common card name (Copy, Wanted, Punish)
//      lets through comic books, vinyl, photographs etc.
function isLikelyMatch(title: string, card: CardForSync): boolean {
  const t = title.toLowerCase();
  const nameWords = significantTokens(card.name);
  if (nameWords.length > 0 && !nameWords.every((w) => containsWord(t, w))) {
    return false;
  }
  const strongGameWords = [
    ...significantTokens(card.gameName).filter((w) => w.length >= 6),
    card.gameSlug.toLowerCase(),
  ];
  return strongGameWords.some((w) => containsWord(t, w));
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
    if (!isQueryWorthwhile(card)) continue;
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
