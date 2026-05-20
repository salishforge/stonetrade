/**
 * Run wonderstradingpost sync directly — bypasses the HTTP route timeout
 * and shows progress in the terminal.
 *
 * Usage:
 *   npx tsx scripts/run-wonderstradingpost-sync.ts              # full backfill
 *   npx tsx scripts/run-wonderstradingpost-sync.ts 2026-05-01   # incremental
 *
 * Env loading mirrors run-pricecharting-sync.ts: synchronous dotenv first,
 * then dynamic imports so the Prisma singleton picks up DATABASE_URL.
 */
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

const sinceArg = process.argv[2];
const since = sinceArg ? new Date(sinceArg) : undefined;
if (since && isNaN(since.getTime())) {
  console.error(`Invalid date: ${sinceArg}`);
  process.exit(1);
}

console.log(
  since
    ? `Syncing Wonders Trading Post sold listings since ${since.toISOString()}...`
    : `Syncing all Wonders Trading Post sold listings (full backfill)...`,
);

(async () => {
  const { syncWonderstradingpost } = await import("../src/lib/wonderstradingpost/sync.js");
  const { prisma } = await import("../src/lib/prisma.js");

  const start = Date.now();
  try {
    const result = await syncWonderstradingpost({ since });
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    console.log(`\nDone in ${elapsed}s`);
    console.log(`  Rows fetched:        ${result.rowsFetched}`);
    console.log(`  Prices added:        ${result.pricesAdded}`);
    console.log(`  Skipped (duplicate): ${result.skippedDuplicate}`);
    console.log(`  Skipped (unmatched): ${result.skippedUnmatched}`);
    console.log(`  Skipped (invalid):   ${result.skippedInvalid}`);
    console.log(`  Errors:              ${result.errors.length}`);
    if (result.errors.length) {
      console.log("\nFirst 10 errors:");
      result.errors.slice(0, 10).forEach((e) => console.log(`  ${e.listingId}: ${e.message}`));
    }
  } finally {
    await prisma.$disconnect();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
