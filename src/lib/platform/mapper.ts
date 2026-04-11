import type { PlatformCardData } from "@/types/platform";
import { WOTF_TREATMENTS, OCM_SERIAL_LIMITS } from "@/types/platform";

interface MarketplaceCardInput {
  gameId: string;
  setId: string;
  cardNumber: string;
  name: string;
  orbital: string | null;
  rarity: string;
  cardType: string;
  treatment: string;
  buildPoints: number | null;
  isSerialized: boolean;
  serialTotal: number | null;
  rulesText: string | null;
}

/** Capitalize first letter of rarity (platform uses lowercase) */
function normalizeRarity(rarity: string): string {
  if (!rarity) return rarity;
  return rarity.charAt(0).toUpperCase() + rarity.slice(1).toLowerCase();
}

/** Build rules text from abilities array */
function abilitiesToRulesText(abilities: string[] | null): string | null {
  if (!abilities || abilities.length === 0) return null;
  return abilities.join("; ");
}

/**
 * Map a single platform CardData to multiple marketplace Card inputs,
 * one per treatment variant.
 */
export function mapPlatformCardToMarketplace(
  card: PlatformCardData,
  gameId: string,
  setId: string,
): MarketplaceCardInput[] {
  const rarity = normalizeRarity(card.rarity);
  const rulesText = abilitiesToRulesText(card.abilities);

  // Skip tokens — they are not marketplace items
  if (card.is_token || card.rarity === "T") {
    return [];
  }

  return WOTF_TREATMENTS.map((treatment) => {
    let isSerialized = false;
    let serialTotal: number | null = null;

    if (treatment === "OCM") {
      isSerialized = true;
      serialTotal = OCM_SERIAL_LIMITS[rarity] ?? null;
    } else if (treatment === "Stonefoil") {
      isSerialized = true;
      serialTotal = 1;
    }

    return {
      gameId,
      setId,
      cardNumber: card.card_number.includes("/")
        ? card.card_number
        : `${card.card_number}/401`,
      name: card.name,
      orbital: card.orbital,
      rarity,
      cardType: card.card_type,
      treatment,
      buildPoints: card.dbs_score,
      isSerialized,
      serialTotal,
      rulesText,
    };
  });
}
