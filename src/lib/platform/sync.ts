import { prisma } from "@/lib/prisma";
import { fetchAllCards } from "./client";
import { mapPlatformCardToMarketplace } from "./mapper";
import { syncEngineMetrics } from "./sync-engine-metrics";

/**
 * Sync cards from the sibling wonders-ccg-platform Card Database API
 * into the marketplace database. Creates treatment variants for each card.
 * Wonders has multiple sets; cards are assigned to a Set based on the
 * platform's `set_name` field. Unknown sets fall through to Existence (the
 * launch set) so a new platform-side set ships into the marketplace as a
 * known-quantity rather than crashing the sync.
 *
 * This is a manual operation — not run automatically.
 * Use when the platform has updated card data to pull in.
 */

// Map platform set_name → marketplace Set metadata.
// Set codes are the marketplace's internal stable identifier (used in URLs
// and seed-fixture references); names are the human-readable display.
const WOTF_SETS: Record<string, { code: string; name: string; totalCards: number }> = {
  "Existence": { code: "EX1", name: "Existence", totalCards: 478 },
  "Call of the Stones": { code: "CotS", name: "Call of the Stones", totalCards: 481 },
};
const DEFAULT_WOTF_SET = WOTF_SETS["Existence"];

export async function syncFromPlatform() {
  console.log("Fetching cards from platform API...");
  const platformCards = await fetchAllCards();
  console.log(`Fetched ${platformCards.length} cards from platform`);

  if (platformCards.length === 0) {
    console.log("No cards to sync.");
    return { synced: 0 };
  }

  const game = await prisma.game.upsert({
    where: { slug: "wotf" },
    update: {},
    create: {
      name: "Wonders of the First",
      slug: "wotf",
      publisher: "Wonders of the First LLC",
      website: "https://wondersccg.com",
    },
  });

  // Ensure each known set exists. Cache by code so we can look up by
  // platform set_name during the loop.
  const setIdByName = new Map<string, string>();
  for (const meta of Object.values(WOTF_SETS)) {
    const set = await prisma.set.upsert({
      where: { gameId_code: { gameId: game.id, code: meta.code } },
      update: { name: meta.name, totalCards: meta.totalCards },
      create: {
        gameId: game.id,
        name: meta.name,
        code: meta.code,
        totalCards: meta.totalCards,
      },
    });
    setIdByName.set(meta.name, set.id);
  }

  let synced = 0;
  const unknownSets = new Set<string>();

  for (const platformCard of platformCards) {
    // Resolve set from platform set_name, with a fallback to Existence.
    const platformSetName = platformCard.set_name ?? "";
    let setId = setIdByName.get(platformSetName);
    if (!setId) {
      if (platformSetName) unknownSets.add(platformSetName);
      setId = setIdByName.get(DEFAULT_WOTF_SET.name)!;
    }

    const variants = mapPlatformCardToMarketplace(platformCard, game.id, setId);

    for (const variant of variants) {
      await prisma.card.upsert({
        where: {
          setId_cardNumber_treatment: {
            setId: variant.setId,
            cardNumber: variant.cardNumber,
            treatment: variant.treatment,
          },
        },
        update: {
          name: variant.name,
          orbital: variant.orbital,
          rarity: variant.rarity,
          cardType: variant.cardType,
          buildPoints: variant.buildPoints,
          rulesText: variant.rulesText,
          flavorText: variant.flavorText,
          imageUrl: variant.imageUrl,
        },
        create: variant,
      });
      synced++;
    }
  }

  if (unknownSets.size > 0) {
    console.warn(
      `Unknown platform set_name(s) routed to ${DEFAULT_WOTF_SET.name}:`,
      [...unknownSets].join(", "),
    );
  }

  console.log(`Synced ${synced} card variants`);

  // Refresh CardEngineMetrics for the cards we just synced. Engine metrics
  // depend on the same identity (cardNumber), so running them in lockstep
  // keeps PRI fresh whenever card data is pulled. Failures here log but do
  // not roll back the card sync — the platform's deck-stats service may be
  // down independently of card data.
  let engineResult: Awaited<ReturnType<typeof syncEngineMetrics>> | null = null;
  try {
    engineResult = await syncEngineMetrics();
    console.log(
      `Synced engine metrics: fetched ${engineResult.fetched}, matched ${engineResult.matched}, upserted ${engineResult.upserted}`,
    );
  } catch (err) {
    console.error("Engine metrics sync failed (card sync still succeeded):", err);
  }

  return { synced, engineMetrics: engineResult };
}
