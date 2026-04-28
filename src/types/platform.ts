/**
 * Types matching the sibling wonders-ccg-platform Card Database API responses.
 * Used by src/lib/platform/client.ts for data sync.
 */

export interface PlatformCardData {
  card_number: string;
  name: string;
  card_type: string; // Wonder, Land, Spell, Item
  power: number | null;
  cost: number;
  orbital: string | null;
  tier: string; // Legendary, Primary, Secondary
  rarity: string; // common, uncommon, rare, T
  abilities: string[] | null;
  parsed_abilities: Record<string, unknown>[] | null;
  synergies: string[];
  counters: string[];
  dbs_score: number | null;
  set_name: string | null;
  release_date: string | null;
  classes: string[];
  faction: string | null;
  is_core: boolean;
  is_equipment: boolean;
  is_token: boolean;
  // Optional fields the Card DB API exposes; not always populated server-side
  image_url?: string | null;
  flavor_text?: string | null;
}

/**
 * Per-card play statistics aggregated across decks. Returned by the platform's
 * /api/v1/meta/card-stats endpoint. Cards never observed in any deck are absent
 * from the response.
 */
export interface PlatformCardStat {
  card_number: string;
  decks_containing: number;
  total_quantity: number;
  avg_copies_when_included: number;
  /** Win rate weighted by quantity, on 0–1 scale. */
  avg_win_rate: number;
  /** Sum of (win_rate × quantity) across decks. */
  weighted_score: number;
}

export interface PlatformCardStatsResponse {
  /** Format the aggregation was scoped to, or null if all formats. */
  format: string | null;
  /** Total deck count in the scope (denominator for inclusion percentage). */
  decks_total: number;
  cards: PlatformCardStat[];
}

export interface PlatformCardStatsParams {
  card_number?: string;
  format_name?: string;
  limit?: number;
  skip?: number;
}

export interface PlatformCardSearchParams {
  name?: string;
  orbital?: string;
  card_type?: string;
  tier?: string;
  rarity?: string;
  power_min?: number;
  power_max?: number;
  cost_min?: number;
  cost_max?: number;
  dbs_min?: number;
  dbs_max?: number;
  faction?: string;
  is_core?: boolean;
  is_equipment?: boolean;
  is_token?: boolean;
  sort_by?: string;
  skip?: number;
  limit?: number;
}

/** WoTF treatment types */
export const WOTF_TREATMENTS = [
  "Classic Paper",
  "Classic Foil",
  "Formless Foil",
  "OCM",
  "Stonefoil",
] as const;

export type WotfTreatment = (typeof WOTF_TREATMENTS)[number];

/** OCM serial limits by rarity */
export const OCM_SERIAL_LIMITS: Record<string, number> = {
  Common: 99,
  Uncommon: 75,
  Rare: 50,
  Epic: 25,
  Mythic: 10,
};

/** BOBA treatment types */
export const BOBA_TREATMENTS = [
  "Base",
  "Superfoil",
  "Inspired Ink Auto",
] as const;

export type BobaTreatment = (typeof BOBA_TREATMENTS)[number];
