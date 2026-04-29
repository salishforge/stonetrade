# Session Handoff — Novu P1 + P3 + P4 + P5

Snapshot for resuming work from a different machine (e.g., Claude Desktop on
Windows over a remote session). Everything you need to pick up where this
session left off. P2 (cut over the direct sendEmail in stripe webhook) is
intentionally skipped — see "What still needs a human in a browser?" below.

## What state is the repo in?

- Branch: `master`
- Last upstream commit: `c37e62b feat: bounties — public want-list entries that match against new listings`
- Working tree: P1 changes pending commit (see `git status`)

## What was done

Phase 1 of the Novu integration plus P3-P5. P1 was the foundation
(wrapper + bell + order-paid). P3 added four more workflow trigger sites.
P4 replaced the bundled `<Inbox>` with a custom popover built on the
headless primitives. P5 moved all five workflows into code via
`@novu/framework`.

### P1 — foundation

| File | Change |
|---|---|
| `package.json`, `package-lock.json` | Added `@novu/api` ^3.15.0, `@novu/react` ^3.16.0, and (P5) `@novu/framework` ^2.10.0 |
| `src/lib/notify/novu.ts` | NEW — server wrapper. No-ops when `NOVU_API_KEY` unset; swallows trigger errors |
| `src/app/layout.tsx` | Refactored: fetch `currentUser` always (regardless of `AUTH_MODE`); placed `<NotificationBell>` beside `<UserMenu>` |
| `src/app/api/stripe/webhook/route.ts` | `handleCheckoutCompleted` triggers `order-paid` (buyer) — and `listing-sold` (seller) added in P3 |
| `.env.example` | Added `NOVU_API_KEY`, `NEXT_PUBLIC_NOVU_APP_IDENTIFIER` |
| `docs/novu-setup.md`, `docs/handoff.md` | NEW |

### P3 — additional triggers

| File | Change |
|---|---|
| `src/app/api/stripe/webhook/route.ts` | Added `listing-sold` trigger to seller; transactionId is `${payment_intent}:seller` |
| `src/app/api/offers/route.ts` | POST triggers `offer-received` to listing seller, transactionId = offer.id |
| `src/app/api/offers/[id]/route.ts` | `accept` action triggers `outbid` for every other PENDING offer's buyer on the listing |
| `src/lib/bounties/match.ts` | Both match paths fire `bounty-hit`; legacy `UserAlert.create` kept during migration |

### P4 — custom bell on headless primitives

| File | Change |
|---|---|
| `src/components/notifications/NotificationBell.tsx` | Rewritten: `<NovuProvider>` wraps a `<Popover>` (Base UI) containing `<Bell>` (custom render with gold unread badge) and `<Notifications>`. `NEXT_PUBLIC_NOVU_USE_INBOX=true` falls back to the bundled `<Inbox>` for A/B comparison |

### P5 — code-defined workflows

| File | Change |
|---|---|
| `src/lib/notify/workflows/order-paid.ts` | NEW — buyer in-app + email |
| `src/lib/notify/workflows/listing-sold.ts` | NEW — seller in-app + email |
| `src/lib/notify/workflows/offer-received.ts` | NEW — seller in-app + email |
| `src/lib/notify/workflows/bounty-hit.ts` | NEW — bounty owner in-app + email; body discriminates on `payload.source` (listing vs collection) |
| `src/lib/notify/workflows/outbid.ts` | NEW — losing offer buyer in-app + email |
| `src/lib/notify/workflows/index.ts` | NEW — registers all five with `@novu/framework` |
| `src/app/api/novu/route.ts` | NEW — bridge endpoint via `serve()` from `@novu/framework/next`; `runtime = "nodejs"` |

Type-check (`npx tsc --noEmit`) is clean. Lint reports 7 pre-existing
problems in unrelated files (none in any P1/P3/P4/P5 file).

## What still needs a human in a browser?

These are not code changes — they're things the user has to do at
<https://web.novu.co>. Full instructions in `docs/novu-setup.md`.

- [ ] Create Novu cloud account (or self-host).
- [ ] Copy keys → set `NOVU_API_KEY` and `NEXT_PUBLIC_NOVU_APP_IDENTIFIER` in
      `.env.local` (and Vercel/Supabase prod env when shipping).
- [ ] Add Resend integration in Novu (Email channel).
- [ ] Run `npx novu sync --bridge-url <url>/api/novu --secret-key $NOVU_API_KEY`
      to push the five code-defined workflows into the dashboard.
      Locally that means tunneling: `ngrok http 3000` first, then sync to
      the ngrok URL.
- [ ] Verify the workflows appear in the dashboard with In-App + Email steps.
      No need to author them by hand — the code is the source of truth.

After that, end-to-end test:
- Trigger a Stripe `checkout.session.completed` (Stripe CLI:
  `stripe trigger checkout.session.completed`). Both buyer ("order-paid")
  and seller ("listing-sold") should see in-app + email.
- Place an offer on a listing as a non-seller user. Seller bell ticks.
- Accept the offer; if other PENDING offers exist on the same listing,
  those buyers see "outbid".
- Add a bounty for a card that has an active listing matching condition
  + price → bounty owner sees "bounty-hit".

## What is Phase 2 (next session)?

Cut the direct `sendEmail` call out of `handleCheckoutCompleted` once
Novu's email step is shown to deliver equivalent content (the `order-paid`
workflow already has an Email step that ~mirrors `renderOrderConfirmation
Html`). Remaining checklist lives in `docs/novu-setup.md` under "What's
NOT done yet".

## Local environment snapshot

- Working dir: `/home/artificium/dev/projects/stonetrade/stonetrade`
- Postgres: `stonetrade-postgres-1` running on `localhost:5436` (Docker)
- Wonders platform: `localhost:8001` (running, healthy)
- Dev server command: `npm run dev` (turbopack)
- Type-check: `npx tsc --noEmit` (no `npm run typecheck` script exists)
- Lint: `npm run lint`
- DB studio: `npm run db:studio`

## Resuming from Claude Desktop on Windows

1. Open this repo in the remote session.
2. Read `docs/handoff.md` and `docs/novu-setup.md`.
3. If env vars are not yet set, ask the user to do the browser steps in
   `novu-setup.md` first. Without keys the wrapper no-ops and the bell is
   invisible — you cannot E2E test.
4. With env vars set, start dev server, sign in, trigger a Stripe checkout
   completion via Stripe CLI, verify both bell + email.
5. When ready for P2, follow the checklist in `docs/novu-setup.md`.

## Known gotchas

- `src/lib/auth.ts` `getCurrentUser()` returns a mock `dev-user` in
  `AUTH_MODE=mock`. The bell will subscribe with `dev-user.id` in dev — fine
  for local testing, but the subscriber pile grows in Novu's dashboard.
  Clean up dev subscribers before production.
- The Inbox popover styling is "good enough" for P1 — it inherits
  `inboxDarkTheme` and our CSS variables but doesn't match the warm-backroom
  palette pixel-for-pixel. P4 swaps to the headless API.
- During P1, every paid order produces TWO emails: one direct from Resend
  (existing `sendEmail` call) and one from Novu's email step. That's the
  cost of running both paths in parallel for the migration. P2 collapses to
  one.
