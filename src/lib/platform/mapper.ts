import type { PlatformCardData } from "@/types/platform";
import { WOTF_TREATMENTS, OCM_SERIAL_LIMITS } from "@/types/platform";
import { isLoreMythicCard } from "@/lib/dragon/lore-cards";

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
  isLoreMythic: boolean;
  rulesText: string | null;
  flavorText: string | null;
  imageUrl: string | null;
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
 * Compute the image URL for a card. The platform stores images at
 * frontend/public/cards/{prefix}_{rest}.webp where prefix is "Existence" or
 * "CotS". Maps the platform's card_number formats to those filenames:
 *
 *   "CotS_282"   → CotS_282.webp           (already prefixed)
 *   "Existence_*"→ Existence_*.webp        (already prefixed)
 *   "E_036"      → Existence_036.webp      (drop "E_", apply Existence prefix)
 *   "T-019"      → Existence_T-019.webp    (token, prepend Existence_)
 *   "P-001"      → Existence_P-001.webp    (promo, prepend Existence_)
 *   "A1-298"     → Existence_A1-298.webp   (alt-art, prepend Existence_)
 *   "001"        → Existence_001.webp      (bare collector, prepend Existence_)
 *
 * WONDERS_PLATFORM_IMAGE_BASE_URL controls the host (dev nginx, prod CDN).
 */
function imageUrlFromCardNumber(cardNumber: string): string {
  const baseUrl =
    process.env.WONDERS_PLATFORM_IMAGE_BASE_URL ?? "http://localhost:3000/cards";
  // Trim a "/401" suffix if present — image filenames don't have it.
  const bare = cardNumber.split("/")[0];

  let filename: string;
  if (bare.startsWith("CotS_") || bare.startsWith("Existence_")) {
    filename = `${bare}.webp`;
  } else if (bare.startsWith("E_")) {
    // Platform stores Existence cards as "E_036"; image file is "Existence_036.webp".
    filename = `Existence_${bare.slice(2)}.webp`;
  } else {
    filename = `Existence_${bare}.webp`;
  }
  return `${baseUrl.replace(/\/$/, "")}/${filename}`;
}

/**
 * Map a single platform CardData to multiple marketplace Card inputs,
 * one per treatment variant. setCode is required so the Dragon Cup
 * lore-mythic manifest can be consulted: a (setCode, name) hit flips
 * isLoreMythic on every treatment row.
 */
export function mapPlatformCardToMarketplace(
  card: PlatformCardData,
  gameId: string,
  setId: string,
  setCode: string,
): MarketplaceCardInput[] {
  const rarity = normalizeRarity(card.rarity);
  const rulesText = abilitiesToRulesText(card.abilities);

  // Skip tokens — they are not marketplace items
  if (card.is_token || card.rarity === "T") {
    return [];
  }

  const isLoreMythic = isLoreMythicCard(setCode, card.name);

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
      isLoreMythic,
      rulesText,
      // The platform's `image_url` column is unpopulated; images live on the
      // frontend container's filesystem. Fall back to the platform-derived URL
      // when the API doesn't supply one.
      flavorText: card.flavor_text ?? null,
      imageUrl:
        (typeof card.image_url === "string" && card.image_url.length > 0)
          ? card.image_url
          : imageUrlFromCardNumber(card.card_number),
    };
  });
}
