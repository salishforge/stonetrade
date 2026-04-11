import { PrismaClient } from "../../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import data from "./data/wotf-existence.json" with { type: "json" };

const OCM_SERIAL_LIMITS: Record<string, number> = {
  Common: 99,
  Uncommon: 75,
  Rare: 50,
  Epic: 25,
  Mythic: 10,
};

const TREATMENTS = [
  { name: "Classic Paper", serialized: false },
  { name: "Classic Foil", serialized: false },
  { name: "Formless Foil", serialized: false },
  { name: "OCM", serialized: true },
  { name: "Stonefoil", serialized: true },
] as const;

export async function seedWotfExistence(prisma: PrismaClient) {
  console.log("Seeding Wonders of the First — Existence set...");

  // Upsert game
  const game = await prisma.game.upsert({
    where: { slug: data.game.slug },
    update: {},
    create: {
      name: data.game.name,
      slug: data.game.slug,
      publisher: data.game.publisher,
      website: data.game.website,
    },
  });

  // Upsert set
  const set = await prisma.set.upsert({
    where: { gameId_code: { gameId: game.id, code: data.set.code } },
    update: {},
    create: {
      gameId: game.id,
      name: data.set.name,
      code: data.set.code,
      releaseDate: new Date(data.set.releaseDate),
      totalCards: data.set.totalCards,
    },
  });

  let cardCount = 0;

  for (const card of data.cards) {
    for (const treatment of TREATMENTS) {
      const isSerialized = treatment.serialized;
      let serialTotal: number | null = null;

      if (treatment.name === "OCM") {
        serialTotal = OCM_SERIAL_LIMITS[card.rarity] ?? null;
      } else if (treatment.name === "Stonefoil") {
        serialTotal = 1;
      }

      await prisma.card.upsert({
        where: {
          setId_cardNumber_treatment: {
            setId: set.id,
            cardNumber: card.cardNumber,
            treatment: treatment.name,
          },
        },
        update: {
          name: card.name,
          orbital: card.orbital ?? null,
          rarity: card.rarity,
          cardType: card.cardType,
        },
        create: {
          gameId: game.id,
          setId: set.id,
          cardNumber: card.cardNumber,
          name: card.name,
          orbital: card.orbital ?? null,
          rarity: card.rarity,
          cardType: card.cardType,
          treatment: treatment.name,
          isSerialized,
          serialTotal,
        },
      });
      cardCount++;
    }
  }

  console.log(`  Created/updated ${cardCount} card variants (${data.cards.length} base cards x ${TREATMENTS.length} treatments)`);
  console.log(`  Game: ${game.name} (${game.id})`);
  console.log(`  Set: ${set.name} (${set.id})`);
}
