/**
 * eBay Browse API client.
 * Activated when EBAY_APP_ID is configured (developer token received).
 */

interface EbaySoldItem {
  itemId: string;
  title: string;
  price: number;
  currency: string;
  soldDate: string;
  imageUrl: string | null;
  itemUrl: string;
}

const BASE_URL = "https://api.ebay.com/buy/browse/v1";

function getHeaders(): HeadersInit {
  const appId = process.env.EBAY_APP_ID;
  if (!appId) throw new Error("EBAY_APP_ID not configured");

  return {
    Authorization: `Bearer ${appId}`,
    "Content-Type": "application/json",
    "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
  };
}

/**
 * Search eBay for completed/sold items matching a card name.
 */
export async function searchSoldItems(query: string, limit = 20): Promise<EbaySoldItem[]> {
  const params = new URLSearchParams({
    q: query,
    filter: "buyingOptions:{FIXED_PRICE|AUCTION},conditions:{NEW|LIKE_NEW}",
    sort: "-endDate",
    limit: String(limit),
  });

  const res = await fetch(`${BASE_URL}/item_summary/search?${params}`, {
    headers: getHeaders(),
  });

  if (!res.ok) {
    throw new Error(`eBay API error: ${res.status}`);
  }

  const data = await res.json();
  return ((data.itemSummaries ?? []) as Array<Record<string, unknown>>).map((item) => ({
    itemId: item.itemId as string,
    title: item.title as string,
    price: Number((item.price as Record<string, unknown>)?.value ?? 0),
    currency: (item.price as Record<string, unknown>)?.currency as string ?? "USD",
    soldDate: item.itemEndDate as string,
    imageUrl: (item.image as Record<string, unknown>)?.imageUrl as string ?? null,
    itemUrl: item.itemWebUrl as string,
  }));
}

/**
 * Check if eBay integration is configured.
 */
export function isEbayConfigured(): boolean {
  return !!process.env.EBAY_APP_ID;
}
