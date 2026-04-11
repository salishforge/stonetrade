import type { PlatformCardData, PlatformCardSearchParams } from "@/types/platform";

const BASE_URL = process.env.WONDERS_PLATFORM_API_URL ?? "http://localhost:8001";

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

export async function searchCards(params: PlatformCardSearchParams = {}): Promise<PlatformCardData[]> {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      searchParams.set(key, String(value));
    }
  }
  const query = searchParams.toString();
  return fetchApi<PlatformCardData[]>(`/api/v1/cards${query ? `?${query}` : ""}`);
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
