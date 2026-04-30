/**
 * One-shot: HEAD-check every Card.imageUrl against the image server. URLs that
 * 404 (the mapper guessed wrong, the file doesn't exist) get set to NULL so
 * the browse page's "cards with images first" sort surfaces them last.
 *
 * Run after `wipe-and-resync.ts`. Safe to re-run; it only ever sets URLs to
 * NULL (never restores them — re-run sync for that).
 *
 * Usage: `npx tsx scripts/validate-card-images.ts`
 */

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const CONCURRENCY = 20;

async function head(url: string): Promise<number> {
  try {
    const res = await fetch(url, { method: "HEAD" });
    return res.status;
  } catch {
    return 0; // network/refused → treat as missing
  }
}

async function main() {
  // Distinct URLs; treatment variants of the same card share one filename
  // so we don't HEAD-check the same URL repeatedly.
  const distinct = await prisma.card.findMany({
    where: { imageUrl: { not: null } },
    select: { imageUrl: true },
    distinct: ["imageUrl"],
  });
  const urls = distinct.map((c) => c.imageUrl as string);
  console.log(`Validating ${urls.length} distinct image URLs at concurrency ${CONCURRENCY}…`);

  const missing: string[] = [];
  let done = 0;
  // Simple worker pool — split URLs evenly across CONCURRENCY workers.
  const queue = [...urls];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length > 0) {
        const url = queue.shift();
        if (!url) break;
        const code = await head(url);
        if (code !== 200) missing.push(url);
        done++;
        if (done % 200 === 0) console.log(`  ${done}/${urls.length}`);
      }
    }),
  );

  console.log(`\n${missing.length} of ${urls.length} URLs returned non-200.`);
  if (missing.length > 0 && missing.length < 30) {
    for (const u of missing) console.log(`  · ${u}`);
  }

  if (missing.length === 0) {
    console.log("Nothing to nullify.");
    return;
  }

  const result = await prisma.card.updateMany({
    where: { imageUrl: { in: missing } },
    data: { imageUrl: null },
  });
  console.log(`Cleared imageUrl on ${result.count} Card rows.`);
}

main()
  .catch((err) => {
    console.error("Failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
