/**
 * PriceCharting API client.
 *
 * Auth: static token passed as the `t` query param on every request.
 * No OAuth or token caching — the token is tied to the account subscription.
 *
 * Prices are returned as integer pennies (e.g. 2475 = $24.75).
 * `loose-price` is a rolling average of eBay sold listings and is the
 * canonical single-card market price for TCGs. It is absent on products
 * with no recent price history.
 *
 * The API has no pagination and no platform filter — callers must filter
 * search results by `console-name` to scope to the correct game/set.
 */

const BASE_URL = "https://www.pricecharting.com/api";

// Cloudflare bot-protection on pricecharting.com blocks the default Node.js
// fetch User-Agent. A browser UA passes the challenge.
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
};

export interface PricechartingProduct {
  id: string;
  "product-name": string;
  "console-name": string;
  /** Integer pennies. Absent when no price history exists. */
  "loose-price"?: number;
}

function getToken(): string {
  const t = process.env.PRICECHARTING_API_TOKEN;
  if (!t) throw new Error("PRICECHARTING_API_TOKEN is not configured");
  return t;
}

export function isPricechartingConfigured(): boolean {
  return !!process.env.PRICECHARTING_API_TOKEN;
}

/**
 * Search PriceCharting by name. Returns up to ~25 results with no
 * platform filter — caller must filter by `console-name`.
 */
export async function searchProducts(query: string): Promise<PricechartingProduct[]> {
  const params = new URLSearchParams({ t: getToken(), q: query });
  const res = await fetch(`${BASE_URL}/products?${params}`, { headers: HEADERS });
  if (!res.ok) {
    throw new Error(`PriceCharting search ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { products?: PricechartingProduct[] };
  return data.products ?? [];
}

/**
 * Fetch a single product by its stable PriceCharting ID.
 * Use this when `card.pricechartingId` is already cached in the DB.
 */
export async function getProductById(id: string): Promise<PricechartingProduct> {
  const params = new URLSearchParams({ t: getToken(), id });
  const res = await fetch(`${BASE_URL}/product?${params}`, { headers: HEADERS });
  if (!res.ok) {
    throw new Error(`PriceCharting product ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<PricechartingProduct>;
}
