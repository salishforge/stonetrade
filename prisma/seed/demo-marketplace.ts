/**
 * Optional demo seed — populates listings, sales, and market values so the
 * UI has data to render during review. Run after `db:seed` (cards must exist).
 *
 * Usage: `npx tsx prisma/seed/demo-marketplace.ts`
 */

import "dotenv/config";
import { PrismaClient } from "../../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import Decimal from "decimal.js";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const SELLER_NAMES = ["topdeck-trader", "midwest-cards", "vintage-orbital", "deep-foil"];
const CONDITIONS = ["NEAR_MINT", "LIGHTLY_PLAYED", "MINT"] as const;

function randInt(lo: number, hi: number): number {
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

function pick<T>(xs: readonly T[]): T {
  return xs[Math.floor(Math.random() * xs.length)];
}

async function main() {
  console.log("Seeding demo marketplace data…");

  // Sellers
  const sellers = [];
  for (const name of SELLER_NAMES) {
    const seller = await prisma.user.upsert({
      where: { username: name },
      update: {},
      create: {
        email: `${name}@stonetrade.local`,
        username: name,
        country: "US",
        sellerRating: 4 + Math.random() * 1,
        totalSales: randInt(8, 240),
        stripeAccountId: `acct_demo_${name}`,
        stripeOnboardingComplete: true,
        memberSince: new Date(Date.now() - randInt(60, 720) * 86400000),
      },
    });
    sellers.push(seller);
  }
  console.log(`  ${sellers.length} sellers`);

  // Pick ~30 cards (skew toward Classic Paper for realistic market activity)
  const cards = await prisma.card.findMany({
    where: { treatment: "Classic Paper" },
    take: 30,
  });
  if (cards.length === 0) {
    console.error("No Classic Paper cards found — run `npm run db:seed` first.");
    process.exit(1);
  }

  // Listings — most cards get 1-3, a few "popular" cards get 5-8
  let listingCount = 0;
  for (const card of cards) {
    const popular = Math.random() < 0.2;
    const n = popular ? randInt(5, 8) : randInt(1, 3);
    const basePrice = card.rarity === "Mythic" ? randInt(40, 120)
                    : card.rarity === "Epic" ? randInt(15, 45)
                    : card.rarity === "Rare" ? randInt(4, 18)
                    : randInt(1, 6);

    for (let i = 0; i < n; i++) {
      const seller = pick(sellers);
      const condition = pick(CONDITIONS);
      const conditionMultiplier = condition === "MINT" ? 1.1 : condition === "LIGHTLY_PLAYED" ? 0.85 : 1.0;
      const price = new Decimal(basePrice).times(conditionMultiplier).times(0.85 + Math.random() * 0.3).toDecimalPlaces(2);

      await prisma.listing.create({
        data: {
          sellerId: seller.id,
          cardId: card.id,
          type: "SINGLE",
          condition,
          treatment: card.treatment,
          price,
          quantity: randInt(1, 4),
          quantitySold: 0,
          allowOffers: Math.random() < 0.7,
          minimumOffer: Math.random() < 0.5 ? price.times(0.7).toDecimalPlaces(2) : null,
          shippingOptions: [
            { method: "standard", price: 4.99 },
            { method: "tracked", price: 8.99 },
          ],
          status: "ACTIVE",
          // Spread createdAt over the last few days so "recently listed" sorts well.
          createdAt: new Date(Date.now() - randInt(0, 5) * 86400000 - randInt(0, 23) * 3600000),
        },
      });
      listingCount++;
    }

    // PriceDataPoints — completed sales spanning the last 30 days
    const salesCount = popular ? randInt(8, 20) : randInt(2, 6);
    for (let i = 0; i < salesCount; i++) {
      const condition = pick(CONDITIONS);
      const noise = 0.85 + Math.random() * 0.3;
      const salePrice = new Decimal(basePrice).times(noise).toDecimalPlaces(2);
      const ageDays = randInt(0, 30);
      await prisma.priceDataPoint.create({
        data: {
          cardId: card.id,
          source: Math.random() < 0.4 ? "EBAY_SOLD" : "COMPLETED_SALE",
          price: salePrice,
          condition,
          treatment: card.treatment,
          verified: true,
          createdAt: new Date(Date.now() - ageDays * 86400000 - randInt(0, 23) * 3600000),
        },
      });
    }
  }
  console.log(`  ${listingCount} listings + price history seeded`);

  // Recompute market values for everything we just touched
  const { recalculateAllCardValues } = await import("../../src/lib/pricing/recalculate.js");
  const result = await recalculateAllCardValues();
  console.log(`  ${result.updated} cards' market values recomputed`);

  console.log("Demo seed complete.");
}

main()
  .catch((err) => {
    console.error("Demo seed failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
