/**
 * Run PriceCharting sync directly — bypasses the HTTP route timeout.
 * Usage: npx tsx scripts/run-pricecharting-sync.ts [gameSlug]
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { syncPricechartingForGame } from "../src/lib/pricecharting/sync.js";

const gameSlug = process.argv[2] ?? "wonders-of-the-first";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// Patch prisma into the module's import — the sync module imports from @/lib/prisma
// which uses a singleton. We import it here to ensure the env is loaded first.
process.env.DATABASE_URL ??= "";

console.log(`Syncing PriceCharting prices for game: ${gameSlug}`);
console.log("This will take several minutes (250ms/card rate limit)...\n");

async function main() {
  const start = Date.now();
  try {
    const result = await syncPricechartingForGame(gameSlug);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    console.log(`\nDone in ${elapsed}s`);
    console.log(`  Cards scanned:  ${result.cardsScanned}`);
    console.log(`  Prices added:   ${result.pricesAdded}`);
    console.log(`  Skipped:        ${result.skipped}`);
    console.log(`  Errors:         ${result.errors.length}`);
    if (result.errors.length) {
      console.log("\nErrors:");
      result.errors.slice(0, 20).forEach((e) => console.log(`  ${e.cardId}: ${e.message}`));
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
