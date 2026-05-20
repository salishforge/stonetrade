/**
 * Wonders Trading Post client.
 *
 * Wonders Trading Post (wonderstradingpost.com) is a community marketplace
 * for Wonders of the First built on Lovable + Supabase. Their `listings`
 * table has a public-read RLS policy, so completed sales are reachable via
 * the standard Supabase PostgREST endpoint using the project's anon key.
 *
 * The anon key is embedded in the site's JS bundle by design — it's the
 * Supabase pattern for client-side apps. We pin it as a constant here and
 * fall back to env (`WONDERSTRADINGPOST_ANON_KEY`) when set, so the key can
 * be rotated in prod without a deploy if the upstream rotates theirs.
 *
 * No auth flow, no token caching. One GET, paginated by `Range` headers.
 */
const SUPABASE_URL = "https://lkqahprsomuyjwunxaot.supabase.co";

/**
 * Public anon key as published in wonderstradingpost's JS bundle. This is
 * NOT a secret — Supabase anon keys are JWTs signed with the project's
 * "anon" role and are meant to be shipped to browsers. Replace via env
 * if the upstream rotates.
 */
const DEFAULT_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxrcWFocHJzb211eWp3dW54YW90Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2OTI4MDYsImV4cCI6MjA5MTI2ODgwNn0.fKOaQXEjffXcRw35EnFD-rmHrDM_5B1zWNnjFLvZxls";

function getAnonKey(): string {
  return process.env.WONDERSTRADINGPOST_ANON_KEY ?? DEFAULT_ANON_KEY;
}

export function isWonderstradingpostConfigured(): boolean {
  // Always true: the anon key is hard-coded as a fallback. The override
  // env var lets ops swap it if upstream rotates without a redeploy.
  return true;
}

export interface WtpSoldListing {
  id: string;
  user_id: string;
  card_name: string;
  rarity: string | null;
  condition: string;
  treatment: string;
  set: string;
  price: number;
  quantity: number;
  /** Status flipped to 'sold' on this timestamp. */
  updated_at: string;
  created_at: string;
}

const SELECT_FIELDS = [
  "id",
  "user_id",
  "card_name",
  "rarity",
  "condition",
  "treatment",
  "set",
  "price",
  "quantity",
  "updated_at",
  "created_at",
].join(",");

/**
 * Fetch every listing with `status='sold'`, optionally newer than `since`.
 * Pagination uses Supabase's `Range` header (max 1000 rows per request).
 */
export async function fetchSoldListings(opts: { since?: Date } = {}): Promise<WtpSoldListing[]> {
  const params = new URLSearchParams({
    status: "eq.sold",
    select: SELECT_FIELDS,
    order: "updated_at.desc",
  });
  if (opts.since) {
    params.set("updated_at", `gte.${opts.since.toISOString()}`);
  }

  const out: WtpSoldListing[] = [];
  const pageSize = 1000;
  let from = 0;

  // Supabase PostgREST caps each request at 1000 rows. Loop until we get
  // a short page. The `sold` table is small (hundreds of rows total today)
  // so this typically completes in one iteration.
  while (true) {
    const to = from + pageSize - 1;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/listings?${params}`, {
      headers: {
        apikey: getAnonKey(),
        Authorization: `Bearer ${getAnonKey()}`,
        Accept: "application/json",
        Range: `${from}-${to}`,
        "Range-Unit": "items",
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`wonderstradingpost fetch ${res.status}: ${body.slice(0, 200)}`);
    }
    const batch = (await res.json()) as WtpSoldListing[];
    out.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }

  return out;
}
