/**
 * One-time transformation: deckplanet_wotf_cards.json → stonetrade seed JSON.
 *
 * Run from the stonetrade project root:
 *   node prisma/seed/scripts/transform-deckplanet.mjs
 *
 * Reads the wonders-2.0 deckplanet export (source of truth for card gameplay
 * stats and printed metadata) and writes two seed data files:
 *   prisma/seed/data/wotf-existence.json
 *   prisma/seed/data/wotf-call-of-the-stones.json
 *
 * Field provenance:
 *   card_cost / card_power / card_keywords → wonders-2.0 migration 0007
 *   card_class / card_faction / card_lineage / card_core → migration 0013
 *   abilityName is NOT in deckplanet (it's a vision-ingest field); left null.
 *   isStoneseeker / isLoreMythic are Dragon Cup flags not in deckplanet; left
 *   false and must be curated manually from the Dragon Cup PDF.
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../..");

const DECKPLANET = resolve(
  "/home/artificium/dev/projects/wonders/wonders-2.0/wonders-ccg-platform/scripts/deckplanet_wotf_cards.json"
);
const OUTPUT_DIR = resolve(REPO_ROOT, "prisma/seed/data");

const RARITY_MAP = {
  C: "Common",
  U: "Uncommon",
  R: "Rare",
  E: "Epic",
  M: "Mythic",
  T: "Token",
  P: "Promo",
};

function parseIntOrNull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}

function mapCard(card) {
  return {
    cardNumber: card.card_number,
    name: card.card_name,
    orbital: card.card_orbital ?? null,
    rarity: RARITY_MAP[card.card_rarity] ?? card.card_rarity,
    cardType: card.card_type,
    // Gameplay stats (migration 0007)
    cost: parseIntOrNull(card.card_cost),
    power: parseIntOrNull(card.card_power),
    keywords: card.card_keywords?.length ? JSON.stringify(card.card_keywords) : null,
    // Printed card metadata (migration 0013)
    class: card.card_class?.length ? card.card_class.join(" ") : null,
    faction: card.card_faction ?? null,
    lineage: card.card_lineage ?? null,
    coreMechanic: card.card_core ?? null,
    // ability_name (the named header like "LIGHTSHOW") is a vision-ingest field
    // not present in the deckplanet export. Left null; populated via vision sync.
    abilityName: null,
    // Card text fields
    rulesText: card.card_text ?? card.card_text_unstyled ?? null,
    flavorText: card.card_flavor_text ?? null,
    // Flags
    isToken: card.card_type === "Token",
    // Dragon Cup flags — not derivable from deckplanet; curate from the PDF.
    isStoneseeker: false,
    isLoreMythic: false,
  };
}

const raw = JSON.parse(readFileSync(DECKPLANET, "utf8"));
const published = raw.filter((c) => c.status === "published");

const existence = published.filter((c) => c.card_series === "Existence");
const cots = published.filter((c) => c.card_series === "Call of the Stones");

mkdirSync(OUTPUT_DIR, { recursive: true });

// Existence
writeFileSync(
  resolve(OUTPUT_DIR, "wotf-existence.json"),
  JSON.stringify(
    {
      game: {
        name: "Wonders of the First",
        slug: "wotf",
        publisher: "Wonders of the First LLC",
        website: "https://wondersccg.com",
      },
      set: {
        name: "Existence",
        code: "EX1",
        releaseDate: "2024-06-01",
        totalCards: existence.length,
      },
      cards: existence.map(mapCard),
    },
    null,
    2
  )
);

// Call of the Stones
writeFileSync(
  resolve(OUTPUT_DIR, "wotf-call-of-the-stones.json"),
  JSON.stringify(
    {
      game: {
        name: "Wonders of the First",
        slug: "wotf",
        publisher: "Wonders of the First LLC",
        website: "https://wondersccg.com",
      },
      set: {
        // TODO: verify release date against official announcement
        name: "Call of the Stones",
        code: "COTS1",
        releaseDate: "2025-03-01",
        totalCards: cots.length,
      },
      cards: cots.map(mapCard),
    },
    null,
    2
  )
);

console.log(`Existence:        ${existence.length} cards → prisma/seed/data/wotf-existence.json`);
console.log(`Call of the Stones: ${cots.length} cards → prisma/seed/data/wotf-call-of-the-stones.json`);
console.log("Done. Verify isStoneseeker / isLoreMythic flags before production seed.");
