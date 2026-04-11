import { prisma } from "@/lib/prisma";
import { fetchAllCards } from "./client";
import { mapPlatformCardToMarketplace } from "./mapper";

/**
 * Sync cards from the sibling wonders-ccg-platform Card Database API
 * into the marketplace database. Creates treatment variants for each card.
 *
 * This is a manual operation — not run automatically.
 * Use when the platform has updated card data to pull in.
 */
export async function syncFromPlatform() {
  console.log("Fetching cards from platform API...");
  const platformCards = await fetchAllCards();
  console.log(`Fetched ${platformCards.length} cards from platform`);

  if (platformCards.length === 0) {
    console.log("No cards to sync.");
    return { synced: 0 };
  }

  // Ensure WoTF game and Existence set exist
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

  const set = await prisma.set.upsert({
    where: { gameId_code: { gameId: game.id, code: "EX1" } },
    update: {},
    create: {
      gameId: game.id,
      name: "Existence",
      code: "EX1",
      totalCards: 401,
    },
  });

  let synced = 0;

  for (const platformCard of platformCards) {
    const variants = mapPlatformCardToMarketplace(platformCard, game.id, set.id);

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
        },
        create: variant,
      });
      synced++;
    }
  }

  console.log(`Synced ${synced} card variants`);
  return { synced };
}
