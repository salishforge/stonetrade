# eBay API Setup

This guide takes you from a fresh eBay developer account to a working price-ingestion run for StoneTrade.

## 1. Create an eBay developer account

1. Go to https://developer.ebay.com/signin and sign in with the eBay account that owns the keys.
2. Accept the Developers Program license. Once accepted you can produce app keysets.

## 2. Generate an application keyset

1. Open https://developer.ebay.com/my/keys.
2. You will see two columns — **Sandbox** and **Production**. Each generates a separate keyset.
3. Click **Create a keyset** under whichever column you need. Production keys are gated on completing the eBay Production Application Check (one form, ~5 minutes).

Each keyset produces three values:

| Value     | Maps to                  | Used as                                         |
|-----------|--------------------------|-------------------------------------------------|
| App ID    | `EBAY_APP_ID`            | OAuth Client ID (Browse API, Marketplace Insights) |
| Cert ID   | `EBAY_CERT_ID`           | OAuth Client Secret                             |
| Dev ID    | `EBAY_DEV_ID`            | Required for Trading API (not used yet)         |

> The current marketplace integration only needs **App ID + Cert ID**. Save Dev ID for future Trading API work (e.g. cross-listing your eBay inventory onto StoneTrade).

## 3. Configure local env

Copy the keys into `.env` (or `.env.local`):

```env
EBAY_APP_ID=YourClientId-Stonetra-PRD-xxxxxxxx-xxxxxxxx
EBAY_CERT_ID=PRD-xxxxxxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxx
EBAY_DEV_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
EBAY_ENV=production            # or "sandbox"
EBAY_MARKETPLACE_ID=EBAY_US    # see https://developer.ebay.com/api-docs/static/rest-request-components.html#Marketpl
```

## 4. Verify the OAuth handshake

The simplest smoke test is the health endpoint:

```bash
curl http://localhost:3000/api/admin/ebay-sync
# => { "data": { "configured": true, "environment": "production" } }
```

To exercise the OAuth + Browse paths together, hit `POST` with one card id:

```bash
curl -X POST http://localhost:3000/api/admin/ebay-sync \
  -H 'Content-Type: application/json' \
  -d '{"cardIds": ["<some-card-id>"], "perCardLimit": 5}'
```

A successful response looks like:

```json
{ "data": { "cardsScanned": 1, "listedAdded": 5, "soldAdded": 0, "errors": [] } }
```

If you see `eBay OAuth failed: 401`, double-check that App ID and Cert ID are from the **same column** (sandbox vs. production) and that `EBAY_ENV` matches.

## 5. Sold-item access (optional, recommended)

`EBAY_LISTED` (active listings) data is good as a supply signal but not as a price signal — completed sales are. Sold-item data comes from the **Marketplace Insights API**, which requires an extra approval:

1. Apply at https://developer.ebay.com/develop/apis/restful/buy-marketplace-insights → "Request Access".
2. Provide a brief description of how StoneTrade uses sold data (price discovery for emerging CCGs).
3. Wait for approval (typically 1–3 business days). You'll be notified by email.

After approval, your existing keyset gains the `buy.marketplace.insights` scope automatically — no key change required. Trigger a sold-data run by passing `includeSold: true`:

```bash
curl -X POST http://localhost:3000/api/admin/ebay-sync \
  -H 'Content-Type: application/json' \
  -d '{"gameSlug": "wonders-of-the-first", "includeSold": true}'
```

Until approved, `includeSold: true` will appear as `errors[].phase: "sold"` with a 403 message and the run will still complete the active-listing portion.

## 6. Wiring it into the pricing pipeline

`syncEbayPricesForCards` (in `src/lib/ebay/sync.ts`) does three things:

1. Calls `searchActiveListings` (and `searchSoldItems` when `includeSold: true`).
2. Persists each unique result as a `PriceDataPoint` (deduped on `ebayListingId` per source).
3. Calls `recalculateCardValue` for every card whose data points changed, so the composite `CardMarketValue` reflects the new signals immediately.

Source weights are defined in `src/lib/pricing/constants.ts` — `EBAY_SOLD` carries `0.10`, while `EBAY_LISTED` is currently absent from the weights map. If you want listed data to influence the composite (rather than only display), add it there, e.g.:

```ts
EBAY_LISTED: 0.05,
```

(Lower than `EBAY_SOLD` because asking prices skew high.)

## 7. Operational guidance

- **Rate limits.** The Browse API allows 5,000 calls/day per application by default. The pipeline issues at most one Browse call and one Insights call per card per run, so a full sync of WoTF Existence (~2,000 card variants) consumes roughly half the daily budget. Schedule no more than one full sync per day; rely on listing-event recompute for hot cards.
- **Token caching.** `getAccessToken` caches the OAuth token in-process until 60s before expiry. Multi-instance deployments will fetch one token per instance — that's fine within the 1,000 token-grants/day limit.
- **Sandbox.** Sandbox results are sparse and synthetic. Treat sandbox as a smoke-test environment only; do not run full ingestion against it.
- **Currency.** The pipeline rejects non-USD prices today. Localize when expanding to other marketplaces by writing a USD-conversion step or storing prices in their native currency.

## 8. Future Trading API work

`EBAY_DEV_ID` is reserved for the Trading API, which is needed if/when StoneTrade lets sellers cross-post their eBay listings onto our marketplace. That is out of scope for this phase but the env variable is present so the slot is ready.
