import { PrismaClient } from "../../src/generated/prisma/client.js";
import data from "./data/boba-alpha.json" with { type: "json" };

const TREATMENTS = [
  { name: "Base", serialized: false, serialTotal: null },
  { name: "Superfoil", serialized: true, serialTotal: 1 },
  { name: "Inspired Ink Auto", serialized: true, serialTotal: null },
] as const;

export async function seedBobaAlpha(prisma: PrismaClient) {
  console.log("Seeding Bo Jackson Battle Arena — Alpha Edition...");

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
          rarity: card.rarity,
          cardType: card.cardType,
        },
        create: {
          gameId: game.id,
          setId: set.id,
          cardNumber: card.cardNumber,
          name: card.name,
          rarity: card.rarity,
          cardType: card.cardType,
          treatment: treatment.name,
          athlete: card.athlete ?? null,
          teamAffiliation: card.teamAffiliation ?? null,
          isSerialized: treatment.serialized,
          serialTotal: treatment.serialTotal ?? null,
        },
      });
      cardCount++;
    }
  }

  console.log(`  Created/updated ${cardCount} card variants (${data.cards.length} base cards x ${TREATMENTS.length} treatments)`);
  console.log(`  Game: ${game.name} (${game.id})`);
  console.log(`  Set: ${set.name} (${set.id})`);
}
