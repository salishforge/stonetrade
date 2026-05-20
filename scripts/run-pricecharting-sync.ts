/**
 * Run PriceCharting sync directly — bypasses the HTTP route timeout.
 * Usage: npx tsx scripts/run-pricecharting-sync.ts [gameSlug]
 *
 * Env loading: load .env then .env.local (matching Next.js precedence)
 * synchronously at module top, BEFORE any dynamic import that pulls in the
 * Prisma singleton. tsx does not auto-load env files for scripts, so we
 * own this. The Prisma singleton in src/lib/prisma.ts reads DATABASE_URL
 * at module-construction time — if env isn't loaded first, the adapter
 * gets undefined and pg throws "SASL: client password must be a string"
 * at the first query.
 */
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

const gameSlug = process.argv[2] ?? "wonders-of-the-first";
console.log(`Syncing PriceCharting prices for game: ${gameSlug}`);
console.log("This will take several minutes (1s/card rate limit)...\n");

(async () => {
  // Dynamic imports so the static-import phase runs AFTER dotenv has
  // populated process.env. Static imports would hoist above the config()
  // calls above and trigger the singleton with an undefined connection
  // string.
  const { syncPricechartingForGame } = await import("../src/lib/pricecharting/sync.js");
  const { prisma } = await import("../src/lib/prisma.js");

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
})().catch((e) => { console.error(e); process.exit(1); });
