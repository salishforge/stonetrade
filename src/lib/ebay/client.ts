/**
 * eBay API client.
 *
 * Auth model: OAuth 2.0 Client Credentials grant. The application access
 * token is fetched from the identity endpoint using `EBAY_APP_ID` (Client
 * ID) + `EBAY_CERT_ID` (Client Secret), then cached in-process until shortly
 * before its expiry.
 *
 * Two data sources are exposed:
 *   - searchActiveListings — Browse API. Open to all keysets. Returns active
 *     listings, persisted as `EBAY_LISTED` price data points.
 *   - searchSoldItems     — Marketplace Insights API. Requires the
 *     `buy.marketplace.insights` scope, which is gated behind eBay's
 *     Limited Usage approval. Returns recently-sold items, persisted as
 *     `EBAY_SOLD`.
 */
import { Buffer } from "node:buffer";

type EbayEnv = "production" | "sandbox";

const ENV: EbayEnv = (process.env.EBAY_ENV as EbayEnv) === "sandbox" ? "sandbox" : "production";
const MARKETPLACE_ID = process.env.EBAY_MARKETPLACE_ID ?? "EBAY_US";

const HOSTS: Record<EbayEnv, { api: string; oauth: string }> = {
  production: {
    api: "https://api.ebay.com",
    oauth: "https://api.ebay.com/identity/v1/oauth2/token",
  },
  sandbox: {
    api: "https://api.sandbox.ebay.com",
    oauth: "https://api.sandbox.ebay.com/identity/v1/oauth2/token",
  },
};

const DEFAULT_SCOPES = ["https://api.ebay.com/oauth/api_scope"];
const INSIGHTS_SCOPES = [
  "https://api.ebay.com/oauth/api_scope",
  "https://api.ebay.com/oauth/api_scope/buy.marketplace.insights",
];

let cachedToken: { value: string; expiresAt: number; scope: string } | null = null;

async function getAccessToken(scopes: string[]): Promise<string> {
  const scopeKey = scopes.join(" ");
  if (cachedToken && cachedToken.scope === scopeKey && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }

  const clientId = process.env.EBAY_APP_ID;
  const clientSecret = process.env.EBAY_CERT_ID;
  if (!clientId || !clientSecret) {
    throw new Error("EBAY_APP_ID and EBAY_CERT_ID must be configured");
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const res = await fetch(HOSTS[ENV].oauth, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: scopeKey,
    }),
  });

  if (!res.ok) {
    throw new Error(`eBay OAuth failed: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
    scope: scopeKey,
  };
  return cachedToken.value;
}

export interface EbayItem {
  itemId: string;
  legacyItemId: string | null;
  title: string;
  price: number;
  currency: string;
  condition: string | null;
  imageUrl: string | null;
  itemUrl: string;
  /** End date for active listings, sold date for Insights results. ISO 8601. */
  date: string | null;
}

/**
 * Search the eBay Browse API for active listings matching a query.
 */
export async function searchActiveListings(
  query: string,
  options: { limit?: number; conditions?: string[] } = {}
): Promise<EbayItem[]> {
  const token = await getAccessToken(DEFAULT_SCOPES);
  const limit = Math.min(options.limit ?? 25, 200);

  const params = new URLSearchParams({
    q: query,
    limit: String(limit),
    sort: "newlyListed",
  });
  if (options.conditions?.length) {
    params.set("filter", `conditions:{${options.conditions.join("|")}}`);
  }

  const res = await fetch(`${HOSTS[ENV].api}/buy/browse/v1/item_summary/search?${params}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-EBAY-C-MARKETPLACE-ID": MARKETPLACE_ID,
    },
  });

  if (!res.ok) {
    throw new Error(`eBay Browse API ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as {
    itemSummaries?: Array<{
      itemId?: string;
      legacyItemId?: string;
      title?: string;
      price?: { value?: string; currency?: string };
      condition?: string;
      image?: { imageUrl?: string };
      itemWebUrl?: string;
      itemEndDate?: string;
    }>;
  };

  return (data.itemSummaries ?? []).map((item) => ({
    itemId: item.itemId ?? "",
    legacyItemId: item.legacyItemId ?? null,
    title: item.title ?? "",
    price: Number(item.price?.value ?? 0),
    currency: item.price?.currency ?? "USD",
    condition: item.condition ?? null,
    imageUrl: item.image?.imageUrl ?? null,
    itemUrl: item.itemWebUrl ?? "",
    date: item.itemEndDate ?? null,
  }));
}

/**
 * Search the eBay Marketplace Insights API for recently-sold items.
 *
 * Requires the `buy.marketplace.insights` OAuth scope, which is gated
 * behind eBay's Limited Usage program. Apply at
 * https://developer.ebay.com/develop/apis/restful/buy-marketplace-insights
 *
 * Without that approval, this call will return 403 / "insufficient
 * permissions to access this resource".
 */
export async function searchSoldItems(
  query: string,
  options: { limit?: number; daysBack?: number } = {}
): Promise<EbayItem[]> {
  const token = await getAccessToken(INSIGHTS_SCOPES);
  const limit = Math.min(options.limit ?? 25, 200);
  const daysBack = options.daysBack ?? 90;
  const startDate = new Date(Date.now() - daysBack * 86_400 * 1000).toISOString();

  const params = new URLSearchParams({
    q: query,
    limit: String(limit),
    filter: `lastSoldDate:[${startDate}..]`,
  });

  const res = await fetch(
    `${HOSTS[ENV].api}/buy/marketplace_insights/v1_beta/item_sales/search?${params}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-EBAY-C-MARKETPLACE-ID": MARKETPLACE_ID,
      },
    }
  );

  if (!res.ok) {
    throw new Error(`eBay Marketplace Insights API ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as {
    itemSales?: Array<{
      itemId?: string;
      legacyItemId?: string;
      title?: string;
      lastSoldPrice?: { value?: string; currency?: string };
      lastSoldDate?: string;
      condition?: string;
      image?: { imageUrl?: string };
      itemWebUrl?: string;
    }>;
  };

  return (data.itemSales ?? []).map((item) => ({
    itemId: item.itemId ?? "",
    legacyItemId: item.legacyItemId ?? null,
    title: item.title ?? "",
    price: Number(item.lastSoldPrice?.value ?? 0),
    currency: item.lastSoldPrice?.currency ?? "USD",
    condition: item.condition ?? null,
    imageUrl: item.image?.imageUrl ?? null,
    itemUrl: item.itemWebUrl ?? "",
    date: item.lastSoldDate ?? null,
  }));
}

export function isEbayConfigured(): boolean {
  return !!process.env.EBAY_APP_ID && !!process.env.EBAY_CERT_ID;
}

export function ebayEnvironment(): EbayEnv {
  return ENV;
}

/** Reset the in-process token cache. Useful for tests and rotation. */
export function resetEbayTokenCache(): void {
  cachedToken = null;
}
