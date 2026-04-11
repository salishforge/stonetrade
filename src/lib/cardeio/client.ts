/**
 * Carde.io integration client.
 * Interface-driven — implement when partnership/API access is established.
 */

const BASE_URL = process.env.CARDEIO_API_BASE_URL ?? "https://api.carde.io";
const API_KEY = process.env.CARDEIO_API_KEY;

interface CardeioCard {
  id: string;
  cardNumber: string;
  name: string;
  imageUrl: string;
}

interface TournamentResult {
  eventId: string;
  eventName: string;
  date: string;
  format: string;
  topDecks: Array<{
    placement: number;
    playerName: string;
    deckName: string;
    cards: Array<{ cardNumber: string; quantity: number }>;
  }>;
}

interface DeckCostBreakdown {
  deckName: string;
  cards: Array<{
    cardNumber: string;
    name: string;
    quantity: number;
    unitPrice: number | null;
    totalPrice: number | null;
  }>;
  totalCost: number | null;
  missingPrices: number;
}

function getHeaders(): HeadersInit {
  if (!API_KEY) throw new Error("CARDEIO_API_KEY not configured");
  return {
    Authorization: `Bearer ${API_KEY}`,
    "Content-Type": "application/json",
  };
}

/**
 * Sync card database from Carde.io (images, official data).
 */
export async function syncCardDatabase(): Promise<CardeioCard[]> {
  const res = await fetch(`${BASE_URL}/api/v1/cards?game=wotf&limit=500`, {
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error(`Carde.io API error: ${res.status}`);
  return res.json() as Promise<CardeioCard[]>;
}

/**
 * Get recent tournament results for price impact analysis.
 */
export async function getRecentTournaments(gameSlug: string): Promise<TournamentResult[]> {
  const res = await fetch(`${BASE_URL}/api/v1/tournaments?game=${gameSlug}&limit=10`, {
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error(`Carde.io API error: ${res.status}`);
  return res.json() as Promise<TournamentResult[]>;
}

/**
 * Check if Carde.io integration is configured.
 */
export function isCardeioConfigured(): boolean {
  return !!API_KEY && !!BASE_URL;
}
