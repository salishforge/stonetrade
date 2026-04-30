/**
 * One-shot: wipe stonetrade's card + marketplace data, then resync from the
 * platform's real card database (replacing 200 fake-seeded cards with the
 * full ~5000 treatment variants of the 959 real Wonders cards).
 *
 * Preserves Users, Buylists, Trades, and Collections — those don't depend on
 * specific cards existing post-sync since they reference cards by id and we'd
 * have to wipe them anyway. We do wipe their card-referencing children
 * (BuylistEntry, CollectionCard, TradeItem, ValuePoll, UserAlert, SaleReport)
 * because they'd otherwise dangle to deleted card ids.
 *
 * Run with: `npx tsx scripts/wipe-and-resync.ts`
 */

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { syncFromPlatform } from "../src/lib/platform/sync.js";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("--- Wipe phase ---");

  // Order matters for FK constraints. Children before parents.
  const counts = {
    tradeItem: await prisma.tradeItem.deleteMany({}),
    valuePollVote: await prisma.valuePollVote.deleteMany({}),
    valuePoll: await prisma.valuePoll.deleteMany({}),
    userAlert: await prisma.userAlert.deleteMany({}),
    saleReport: await prisma.saleReport.deleteMany({}),
    buylistEntry: await prisma.buylistEntry.deleteMany({}),
    collectionCard: await prisma.collectionCard.deleteMany({}),
    order: await prisma.order.deleteMany({}),
    offer: await prisma.offer.deleteMany({}),
    listing: await prisma.listing.deleteMany({}),
    priceDataPoint: await prisma.priceDataPoint.deleteMany({}),
    cardMarketValue: await prisma.cardMarketValue.deleteMany({}),
    cardEngineMetricsHistory: await prisma.cardEngineMetricsHistory.deleteMany({}),
    cardEngineMetrics: await prisma.cardEngineMetrics.deleteMany({}),
    card: await prisma.card.deleteMany({}),
    set: await prisma.set.deleteMany({}),
    // Game stays — syncFromPlatform upserts on game.slug = 'wotf'
  };

  for (const [k, v] of Object.entries(counts)) {
    console.log(`  deleted ${v.count} ${k}`);
  }

  console.log("\n--- Sync phase ---");
  // syncFromPlatform also auto-runs syncEngineMetrics in lockstep.
  const result = await syncFromPlatform();
  console.log(`\nSync result: ${JSON.stringify(result)}`);
}

main()
  .catch((err) => {
    console.error("Failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
