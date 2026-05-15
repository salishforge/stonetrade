/**
 * PriceCharting → PriceDataPoint ingestion pipeline.
 *
 * For each card, fetches the current `loose-price` from PriceCharting and
 * persists it as a PRICECHARTING data point. One snapshot per card per UTC
 * day — re-running is safe.
 *
 * Match strategy (per card):
 *   1. Fast path: if `card.pricechartingId` is set, call getProductById directly.
 *   2. Slow path: searchProducts(card.name), then filter by:
 *        a. console-name contains the game name (game anchor)
 *        b. console-name contains the set name (narrows to correct set)
 *        c. card number at end of product-name matches card.cardNumber
 *        d. treatment bracket in product-name matches card.treatment
 *      On a match, write the PC id back to card.pricechartingId so the next
 *      run takes the fast path.
 *
 * Treatment matching: PriceCharting encodes treatment as a bracket suffix in
 * the product name, e.g. "Rus Trooper [Classic Foil] #55". Base (unfoil)
 * cards have no bracket. We compare the bracket content case-insensitively
 * against card.treatment; "Standard" and empty are treated as base.
 *
 * Card number matching: PriceCharting puts the number after a final "#".
 * Our cardNumber may have a set prefix (e.g. "CotS_314/401"). We accept a
 * match when the PC number is a suffix of card.cardNumber after stripping
 * any leading alpha prefix, or is an exact match.
 */
import { prisma } from "@/lib/prisma";
import { searchProducts, getProductById, isPricechartingConfigured, type PricechartingProduct } from "./client";
import { recalculateCardValue } from "@/lib/pricing/recalculate";

const RATE_LIMIT_MS = 1000;

export interface CardForSync {
  id: string;
  name: string;
  cardNumber: string;
  treatment: string;
  setName: string;
  gameName: string;
  pricechartingId: string | null;
}

export interface PricechartingSyncResult {
  cardsScanned: number;
  pricesAdded: number;
  skipped: number;
  errors: Array<{ cardId: string; message: string }>;
}

// Strip set-prefix like "CotS_" from "CotS_314/401" → "314/401".
// PriceCharting omits the prefix in its product-name numbers.
function stripSetPrefix(cardNumber: string): string {
  return cardNumber.replace(/^[A-Za-z]+_/, "");
}

function extractPCNumber(productName: string): string {
  const match = productName.match(/#(\S+)$/);
  return match ? match[1] : "";
}

function cardNumberMatches(cardNumber: string, productName: string): boolean {
  const pcNum = extractPCNumber(productName);
  if (!pcNum) return false;
  const stripped = stripSetPrefix(cardNumber);
  return pcNum === stripped || pcNum === cardNumber;
}

// PriceCharting encodes treatment as "[Classic Foil]" brackets in the product
// name. Base/standard cards have no bracket. We do a case-insensitive compare.
function extractPCTreatment(productName: string): string {
  const match = productName.match(/\[([^\]]+)\]/);
  return match ? match[1] : "";
}

function treatmentMatches(cardTreatment: string, productName: string): boolean {
  const pcTreatment = extractPCTreatment(productName);
  const ct = cardTreatment.toLowerCase();
  // "Base" and empty string both correspond to PC products with no treatment bracket.
  const isBase = !cardTreatment || ct === "base" || ct === "standard";
  if (!pcTreatment) return isBase;
  if (isBase) return false;
  // Exact match first; fall back to prefix match for cases like our "OCM" vs
  // PC's "OCM Serialized" where PC appends a descriptor we don't store.
  const pct = pcTreatment.toLowerCase();
  return ct === pct || pct.startsWith(ct);
}

function consolenameMatchesCard(consoleName: string, card: CardForSync): boolean {
  const cn = consoleName.toLowerCase();
  return (
    cn.includes(card.gameName.toLowerCase()) &&
    cn.includes(card.setName.toLowerCase())
  );
}

function findMatch(products: PricechartingProduct[], card: CardForSync): PricechartingProduct | null {
  for (const p of products) {
    if (!consolenameMatchesCard(p["console-name"], card)) continue;
    if (!cardNumberMatches(card.cardNumber, p["product-name"])) continue;
    if (!treatmentMatches(card.treatment, p["product-name"])) continue;
    return p;
  }
  return null;
}

// UTC midnight of today — used as the idempotency window.
function todayUtcMidnight(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

async function alreadySyncedToday(cardId: string): Promise<boolean> {
  const existing = await prisma.priceDataPoint.findFirst({
    where: {
      cardId,
      source: "PRICECHARTING",
      createdAt: { gte: todayUtcMidnight() },
    },
    select: { id: true },
  });
  return !!existing;
}

async function persistPrice(card: CardForSync, product: PricechartingProduct): Promise<boolean> {
  const loosePrice = product["loose-price"];
  if (!loosePrice || loosePrice <= 0) return false;
  if (await alreadySyncedToday(card.id)) return false;

  await prisma.priceDataPoint.create({
    data: {
      cardId: card.id,
      source: "PRICECHARTING",
      // PC returns integer pennies; Decimal(10,2) stores dollars.
      price: loosePrice / 100,
      condition: "NEAR_MINT",
      treatment: card.treatment,
      pricechartingProductId: product.id,
      verified: true,
    },
  });
  return true;
}

async function resolveProduct(card: CardForSync): Promise<PricechartingProduct | null> {
  if (card.pricechartingId) {
    return getProductById(card.pricechartingId);
  }

  const results = await searchProducts(card.name);
  const match = findMatch(results, card);
  if (!match) return null;

  // Cache the stable PC id so the next run skips the search.
  await prisma.card.update({
    where: { id: card.id },
    data: { pricechartingId: match.id },
  });
  return match;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function syncPricechartingForCards(cards: CardForSync[]): Promise<PricechartingSyncResult> {
  if (!isPricechartingConfigured()) {
    throw new Error("PriceCharting is not configured. Set PRICECHARTING_API_TOKEN.");
  }

  const result: PricechartingSyncResult = { cardsScanned: 0, pricesAdded: 0, skipped: 0, errors: [] };
  const touchedCardIds = new Set<string>();

  for (const card of cards) {
    result.cardsScanned++;

    try {
      const product = await resolveProduct(card);
      if (!product) {
        result.skipped++;
        continue;
      }

      const added = await persistPrice(card, product);
      if (added) {
        result.pricesAdded++;
        touchedCardIds.add(card.id);
      } else {
        result.skipped++;
      }
    } catch (err) {
      result.errors.push({ cardId: card.id, message: (err as Error).message });
    }

    await sleep(RATE_LIMIT_MS);
  }

  for (const cardId of touchedCardIds) {
    try {
      await recalculateCardValue(cardId);
    } catch (err) {
      result.errors.push({ cardId, message: `recalculate: ${(err as Error).message}` });
    }
  }

  return result;
}

export async function syncPricechartingForGame(
  gameSlug: string,
  options: { setCode?: string } = {}
): Promise<PricechartingSyncResult> {
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
      pricechartingId: true,
      set: { select: { name: true } },
      game: { select: { name: true } },
    },
  });

  const cards: CardForSync[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    cardNumber: r.cardNumber,
    treatment: r.treatment,
    pricechartingId: r.pricechartingId,
    setName: r.set.name,
    gameName: r.game.name,
  }));

  return syncPricechartingForCards(cards);
}
