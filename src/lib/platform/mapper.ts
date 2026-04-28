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
 * frontend/public/cards/{prefix}_{number}.webp where the prefix is set-derived.
 * CotS cards are prefixed already in card_number (e.g. "CotS_282"); Existence
 * cards are bare collector numbers (e.g. "T-029") and need an "Existence_"
 * prefix for the image filename.
 *
 * In dev the platform frontend serves images at :3000/cards/{filename}.
 * In prod the deploy may use a CDN or S3 mirror — that's configured via
 * WONDERS_PLATFORM_IMAGE_BASE_URL.
 */
function imageUrlFromCardNumber(cardNumber: string): string {
  const baseUrl =
    process.env.WONDERS_PLATFORM_IMAGE_BASE_URL ?? "http://localhost:3000/cards";
  // Trim a Carde.io-style "/401" suffix if present — image filenames don't have it.
  const bare = cardNumber.split("/")[0];
  const filename = bare.startsWith("CotS_") || bare.startsWith("Existence_")
    ? `${bare}.webp`
    : `Existence_${bare}.webp`;
  return `${baseUrl.replace(/\/$/, "")}/${filename}`;
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
