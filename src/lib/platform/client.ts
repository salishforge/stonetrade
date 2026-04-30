import type {
  PlatformCardData,
  PlatformCardSearchParams,
  PlatformCardStatsParams,
  PlatformCardStatsResponse,
} from "@/types/platform";

const BASE_URL = process.env.WONDERS_PLATFORM_API_URL ?? "http://localhost:8001";

// The Card DB and Deck DB live in the same docker-compose stack but listen on
// different ports. WONDERS_DECK_PLATFORM_API_URL lets prod override
// independently; in dev we reach :8002 on the same host.
const DECK_BASE_URL =
  process.env.WONDERS_DECK_PLATFORM_API_URL ??
  BASE_URL.replace(/:8001$/, ":8002");

async function fetchApi<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) {
    throw new Error(`Platform API error: ${res.status} ${res.statusText} for ${path}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchCard(cardNumber: string): Promise<PlatformCardData> {
  return fetchApi<PlatformCardData>(`/api/v1/cards/${encodeURIComponent(cardNumber)}`);
}

interface CardListResponse {
  total: number;
  skip: number;
  limit: number;
  cards: PlatformCardData[];
}

export async function searchCards(params: PlatformCardSearchParams = {}): Promise<PlatformCardData[]> {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      searchParams.set(key, String(value));
    }
  }
  const query = searchParams.toString();
  // The platform's /api/v1/cards wraps results in { total, skip, limit, cards }.
  // We unwrap here so callers see a bare array.
  const response = await fetchApi<CardListResponse>(`/api/v1/cards${query ? `?${query}` : ""}`);
  return response.cards ?? [];
}

export async function fetchAllCards(batchSize = 200): Promise<PlatformCardData[]> {
  const all: PlatformCardData[] = [];
  let skip = 0;

  while (true) {
    const batch = await searchCards({ limit: batchSize, skip });
    all.push(...batch);
    if (batch.length < batchSize) break;
    skip += batchSize;
  }

  return all;
}

export async function batchLookup(cardNumbers: string[]): Promise<PlatformCardData[]> {
  const res = await fetch(`${BASE_URL}/api/v1/cards/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ card_numbers: cardNumbers }),
  });
  if (!res.ok) {
    throw new Error(`Platform API batch lookup error: ${res.status}`);
  }
  return res.json() as Promise<PlatformCardData[]>;
}

/**
 * Per-card play statistics from the Deck DB service (port 8002). Used by the
 * marketplace's CardEngineMetrics sync to populate deckInclusion/winRate/avgCopies.
 */
export async function fetchCardStats(
  params: PlatformCardStatsParams = {},
): Promise<PlatformCardStatsResponse> {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      searchParams.set(key, String(value));
    }
  }
  const query = searchParams.toString();
  const res = await fetch(`${DECK_BASE_URL}/api/v1/meta/card-stats${query ? `?${query}` : ""}`);
  if (!res.ok) {
    throw new Error(`Platform API error: ${res.status} ${res.statusText} for /api/v1/meta/card-stats`);
  }
  return res.json() as Promise<PlatformCardStatsResponse>;
}
