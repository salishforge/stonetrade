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
 *
 * Transport: Cloudflare on pricecharting.com uses TLS fingerprinting that
 * blocks Node.js fetch regardless of User-Agent. curl bypasses it because
 * its TLS stack presents a different fingerprint. HTTP calls here exec curl
 * as a subprocess. On Vercel (production) fetch works because Vercel IPs
 * are not flagged — the curl path is only needed on self-hosted / VPS.
 */
import { execFileSync } from "node:child_process";

const BASE_URL = "https://www.pricecharting.com/api";

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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Retry once on failure with a 3-second backoff. PriceCharting's Cloudflare
// layer rate-limits rapid bulk requests; a brief pause is enough to recover.
async function curlGet(url: string): Promise<unknown> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const body = execFileSync("curl", ["-sf", "--max-time", "20", url], {
        encoding: "utf8",
      });
      return JSON.parse(body);
    } catch (err) {
      if (attempt === 0) {
        await sleep(3000);
        continue;
      }
      throw err;
    }
  }
}

/**
 * Search PriceCharting by name. Returns up to ~25 results with no
 * platform filter — caller must filter by `console-name`.
 */
export async function searchProducts(query: string): Promise<PricechartingProduct[]> {
  const params = new URLSearchParams({ t: getToken(), q: query });
  const data = (await curlGet(`${BASE_URL}/products?${params}`)) as { products?: PricechartingProduct[] };
  return data.products ?? [];
}

/**
 * Fetch a single product by its stable PriceCharting ID.
 * Use this when `card.pricechartingId` is already cached in the DB.
 */
export async function getProductById(id: string): Promise<PricechartingProduct> {
  const params = new URLSearchParams({ t: getToken(), id });
  return (await curlGet(`${BASE_URL}/product?${params}`)) as PricechartingProduct;
}
