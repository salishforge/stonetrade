# Novu Setup

This doc covers what's needed to activate Novu in a stonetrade environment.
The code already wires Novu in safely — when credentials are absent, every
trigger no-ops and the `<NotificationBell>` component renders nothing. So
nothing here is required for local dev to function; it's required to actually
deliver notifications.

## What's wired (P1 + P3 + P4 + P5)

- `src/lib/notify/novu.ts` — server-side trigger wrapper. Single call site for
  all future workflows. No-ops without `NOVU_API_KEY`. Errors are logged but
  never thrown — same contract as `sendEmail()` in `src/lib/email/resend.ts`.
- `src/lib/notify/workflows/*.ts` — code-first workflow definitions
  (`order-paid`, `listing-sold`, `offer-received`, `bounty-hit`, `outbid`).
  Synced to the dashboard via `npx novu sync` (see "Syncing workflows" below).
- `src/app/api/novu/route.ts` — bridge endpoint Novu Cloud calls to discover
  workflows and execute step resolvers. `serve()` from `@novu/framework/next`.
- `src/components/notifications/NotificationBell.tsx` — header bell + popover
  using `@novu/react`'s headless `<Bell>` and `<Notifications>` wrapped in a
  Base UI `<Popover>`, themed to match the warm-backroom palette. Returns
  `null` without `NEXT_PUBLIC_NOVU_APP_IDENTIFIER`. Set
  `NEXT_PUBLIC_NOVU_USE_INBOX=true` to fall back to the bundled `<Inbox>` for
  A/B comparison during the rollout.
- `src/app/layout.tsx` — bell placed beside `<UserMenu>` in the header.
- `src/app/api/stripe/webhook/route.ts` — `handleCheckoutCompleted` triggers
  `order-paid` (buyer) and `listing-sold` (seller). Stripe's `payment_intent`
  is the `transactionId` for idempotency; seller's transactionId is suffixed
  with `:seller` so retries dedupe independently per recipient.
- `src/app/api/offers/route.ts` — POST triggers `offer-received` to the
  listing seller, with the offer.id as transactionId.
- `src/app/api/offers/[id]/route.ts` — `accept` action triggers `outbid` to
  every other PENDING offer's buyer on the same listing.
- `src/lib/bounties/match.ts` — both `matchAgainstNewListing` and
  `matchAgainstCollectionAdd` now fire `bounty-hit` alongside the legacy
  `UserAlert.create` (kept during migration so the `/alerts` page stays
  populated until P6 cuts over).

## One-time browser setup

These steps require a human in front of a browser. They produce the two env
var values listed below.

1. Sign in at <https://web.novu.co>. Free tier covers 30k events/month.
2. Settings → API Keys. Copy:
   - **Application Identifier** → `NEXT_PUBLIC_NOVU_APP_IDENTIFIER`
   - **Secret Key** → `NOVU_API_KEY`
3. Integrations → Email → Add → Resend. Paste `RESEND_API_KEY` and the same
   from-address used in stonetrade's existing Resend config. Mark as primary.
4. **Skip the dashboard workflow editor** — workflows are now code-first
   under `src/lib/notify/workflows/`. Run the sync command from the next
   section to push them into the dashboard.

## Env vars

```
NOVU_API_KEY=<secret key from step 2>
NEXT_PUBLIC_NOVU_APP_IDENTIFIER=<application identifier from step 2>
# Optional: A/B fallback to the bundled <Inbox> for visual comparison
NEXT_PUBLIC_NOVU_USE_INBOX=
```

Both `NOVU_API_KEY` and `NEXT_PUBLIC_NOVU_APP_IDENTIFIER` are listed in
`.env.example`. Set them in `.env.local` for dev and in the Vercel/Supabase
env for prod.

## Syncing workflows

Workflow definitions live in `src/lib/notify/workflows/` and are served
from `/api/novu` via `@novu/framework/next`. Push them to the dashboard
with the Novu CLI:

```bash
# Locally — point Novu at a tunneled URL (ngrok / cloudflared) since the
# Novu Cloud servers need to reach your bridge endpoint:
ngrok http 3000
npx novu sync \
  --bridge-url https://<your-ngrok-host>/api/novu \
  --secret-key $NOVU_API_KEY

# In CI / on a deployed environment, the bridge is already public:
npx novu sync \
  --bridge-url https://stonetrade.example.com/api/novu \
  --secret-key $NOVU_API_KEY
```

After a sync, the dashboard reflects the latest workflow code. `controls`
(per-step overrides like the email subject line) can still be tweaked in
the dashboard without re-deploying — the schema is the contract.

Recommended: run `novu sync` automatically post-deploy (Vercel build hook
or a one-shot job). Don't wire this into a long-running CI step that holds
session credits.

## Verifying

1. `npm run dev`
2. Sign in (or run in mock mode — bell shows for the dev-user).
3. The bell should render in the header. Click it → empty popover.
4. Trigger a real Stripe checkout completion (use Stripe CLI:
   `stripe trigger checkout.session.completed`) on a stonetrade order.
5. The bell should show `1` and the in-app entry should appear. Resend
   should also deliver the email (the existing
   `renderOrderConfirmationHtml` path still runs in parallel during P1 —
   the user receives two emails until P2 cuts the direct send).

## What's NOT done yet

- **P2** — Cut direct Resend sends over to Novu's email step. Remove the
  `sendEmail` call from `handleCheckoutCompleted`. Requires re-authoring
  the email body inside the workflow file (`src/lib/notify/workflows/order-
  paid.ts`) and validating that the Resend integration delivers them. P2
  also removes the duplicate "two emails per paid order" behavior.
- **P6** — Sunset the legacy `UserAlert.create` calls in
  `src/lib/bounties/match.ts` (and the `/alerts` page) once the in-app
  feed via Novu has been live long enough that no one relies on the old
  alert surface. Drop the `BACK_IN_STOCK` `AlertType` if no other path
  uses it.
- **Auto-buy** — `b.autoBuy=true` bounty matches still log instead of
  creating an Order on behalf of the bounty owner. The Novu trigger fires
  with `payload.autoBuy=true` so the workflow can call out the WOULD-fire
  state, but the actual Stripe path is untouched.
