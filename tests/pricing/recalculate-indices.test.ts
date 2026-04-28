import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import { resetDatabase, prisma } from "../db";

let recalculateCardValue: typeof import("@/lib/pricing/recalculate").recalculateCardValue;

beforeAll(async () => {
  ({ recalculateCardValue } = await import("@/lib/pricing/recalculate"));
});

beforeEach(async () => {
  await resetDatabase();
});

async function seedCardWithSetup() {
  const game = await prisma.game.create({ data: { name: "W", slug: "w", publisher: "S", website: "https://e.com" } });
  const set = await prisma.set.create({ data: { gameId: game.id, name: "Set", code: "S", totalCards: 1 } });
  const card = await prisma.card.create({
    data: { gameId: game.id, setId: set.id, cardNumber: "001", name: "Card", rarity: "Common", cardType: "Unit", treatment: "Classic Paper" },
  });
  return { game, set, card };
}

async function seedPriceHistory(cardId: string, prices: Array<{ price: string; ageDays?: number }>) {
  for (const { price, ageDays = 0 } of prices) {
    await prisma.priceDataPoint.create({
      data: {
        cardId,
        source: "COMPLETED_SALE",
        price,
        condition: "NEAR_MINT",
        treatment: "Classic Paper",
        verified: true,
        createdAt: new Date(Date.now() - ageDays * 86400000),
      },
    });
  }
}

describe("recalculateCardValue: volatility", () => {
  it("classifies stable when CV ≤ 0.10", async () => {
    const { card } = await seedCardWithSetup();
    // 5 nearly-identical prices → very low CV
    await seedPriceHistory(card.id, [
      { price: "10.00" }, { price: "10.10" }, { price: "9.90" }, { price: "10.05" }, { price: "9.95" },
    ]);
    const value = await recalculateCardValue(card.id);
    expect(value?.volatilityTier).toBe("stable");
    expect(Number(value?.coeffVar30d)).toBeLessThan(0.1);
  });

  it("classifies moderate, volatile, or extreme as CV climbs", async () => {
    const { card } = await seedCardWithSetup();
    // High dispersion → CV well above 0.50
    await seedPriceHistory(card.id, [
      { price: "5.00" }, { price: "10.00" }, { price: "15.00" }, { price: "20.00" }, { price: "25.00" },
    ]);
    const value = await recalculateCardValue(card.id);
    expect(["volatile", "extreme"]).toContain(value?.volatilityTier);
    expect(Number(value?.coeffVar30d)).toBeGreaterThan(0.25);
  });

  it("volatilityTier is null when fewer than 3 points within 30d", async () => {
    const { card } = await seedCardWithSetup();
    await seedPriceHistory(card.id, [
      { price: "10.00" }, { price: "11.00" },
    ]);
    const value = await recalculateCardValue(card.id);
    expect(value?.volatilityTier).toBeNull();
    expect(value?.stdDev30d).toBeNull();
  });

  it("excludes points older than 30 days from volatility calc", async () => {
    const { card } = await seedCardWithSetup();
    // 4 ancient extreme points (excluded) + 0 recent → not enough recent for tier
    await seedPriceHistory(card.id, [
      { price: "1.00", ageDays: 60 }, { price: "100.00", ageDays: 70 },
      { price: "1.00", ageDays: 80 }, { price: "100.00", ageDays: 90 },
    ]);
    const value = await recalculateCardValue(card.id);
    expect(value?.volatilityTier).toBeNull();
  });
});

describe("recalculateCardValue: scarcity", () => {
  async function seedSeller() {
    return prisma.user.create({ data: { email: "s@x.com", username: `seller-${Math.random()}` } });
  }
  async function seedBuyer() {
    return prisma.user.create({ data: { email: `b${Math.random()}@x.com`, username: `buyer-${Math.random()}` } });
  }

  it("abundant when supply far exceeds demand (ratio < 0.5)", async () => {
    const { card } = await seedCardWithSetup();
    await seedPriceHistory(card.id, [{ price: "10.00" }]);
    const seller = await seedSeller();
    await prisma.listing.create({
      data: { sellerId: seller.id, cardId: card.id, price: "10.00", condition: "NEAR_MINT", treatment: "Classic Paper", type: "SINGLE", quantity: 100, quantitySold: 0, shippingOptions: [], status: "ACTIVE" },
    });
    // No buylist entries → wanted = 0 → ratio 0 → abundant
    const value = await recalculateCardValue(card.id);
    expect(value?.scarcityTier).toBe("abundant");
    expect(value?.totalWanted).toBe(0);
    expect(value?.totalAvailable).toBe(100);
  });

  it("acute when demand far exceeds supply (ratio >= 3)", async () => {
    const { card } = await seedCardWithSetup();
    await seedPriceHistory(card.id, [{ price: "10.00" }]);
    const seller = await seedSeller();
    const buyer = await seedBuyer();
    await prisma.listing.create({
      data: { sellerId: seller.id, cardId: card.id, price: "10.00", condition: "NEAR_MINT", treatment: "Classic Paper", type: "SINGLE", quantity: 1, quantitySold: 0, shippingOptions: [], status: "ACTIVE" },
    });
    const buylist = await prisma.buylist.create({ data: { userId: buyer.id, name: "want list" } });
    await prisma.buylistEntry.create({
      data: { buylistId: buylist.id, cardId: card.id, maxPrice: "12.00", treatment: "Classic Paper", quantity: 5 },
    });
    const value = await recalculateCardValue(card.id);
    expect(value?.scarcityTier).toBe("acute");
    expect(Number(value?.scarcityRatio)).toBeGreaterThanOrEqual(3);
    expect(value?.totalWanted).toBe(5);
    expect(value?.totalAvailable).toBe(1);
  });

  it("counts only ACTIVE listings (excludes SOLD/CANCELLED) and uses quantity - quantitySold", async () => {
    const { card } = await seedCardWithSetup();
    await seedPriceHistory(card.id, [{ price: "10.00" }]);
    const seller = await seedSeller();
    // ACTIVE: 5 - 2 = 3 available
    await prisma.listing.create({
      data: { sellerId: seller.id, cardId: card.id, price: "10.00", condition: "NEAR_MINT", treatment: "Classic Paper", type: "SINGLE", quantity: 5, quantitySold: 2, shippingOptions: [], status: "ACTIVE" },
    });
    // SOLD: should be excluded
    await prisma.listing.create({
      data: { sellerId: seller.id, cardId: card.id, price: "10.00", condition: "NEAR_MINT", treatment: "Classic Paper", type: "SINGLE", quantity: 4, quantitySold: 4, shippingOptions: [], status: "SOLD" },
    });
    // CANCELLED: should be excluded
    await prisma.listing.create({
      data: { sellerId: seller.id, cardId: card.id, price: "10.00", condition: "NEAR_MINT", treatment: "Classic Paper", type: "SINGLE", quantity: 10, quantitySold: 0, shippingOptions: [], status: "CANCELLED" },
    });
    const value = await recalculateCardValue(card.id);
    expect(value?.totalAvailable).toBe(3);
  });

  it("totalCollected sums CollectionCard quantities for the card", async () => {
    const { card } = await seedCardWithSetup();
    await seedPriceHistory(card.id, [{ price: "10.00" }]);
    const u1 = await prisma.user.create({ data: { email: "c1@x.com", username: "coll1" } });
    const u2 = await prisma.user.create({ data: { email: "c2@x.com", username: "coll2" } });
    const c1 = await prisma.collection.create({ data: { userId: u1.id, name: "main" } });
    const c2 = await prisma.collection.create({ data: { userId: u2.id, name: "main" } });
    await prisma.collectionCard.create({ data: { collectionId: c1.id, cardId: card.id, quantity: 3, condition: "NEAR_MINT", treatment: "Classic Paper" } });
    await prisma.collectionCard.create({ data: { collectionId: c2.id, cardId: card.id, quantity: 7, condition: "NEAR_MINT", treatment: "Classic Paper" } });
    const value = await recalculateCardValue(card.id);
    expect(value?.totalCollected).toBe(10);
  });
});
