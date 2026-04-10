# StoneTrade — CCG Marketplace

## What
Community-driven marketplace and price discovery platform for emerging CCGs (Wonders of the First, Bo Jackson Battle Arena).

## Stack
- Next.js 16 (App Router), TypeScript (strict), Tailwind CSS 4
- PostgreSQL via Supabase, Prisma ORM
- Supabase Auth (email, Google, Discord OAuth)
- Stripe Connect (marketplace split payments)
- Meilisearch (search/facets), Supabase Realtime
- Resend (email), Claude API (AI features)

## Commands
```bash
npm run dev          # Dev server (turbopack)
npm run build        # Production build
npm run lint         # ESLint
npx prisma studio    # DB browser
npx prisma migrate dev --name <name>  # Create migration
npx prisma db seed   # Seed database
```

## Conventions
- App Router with route groups: (auth), (marketplace), (dashboard), (seller), (discovery)
- shadcn/ui for all UI components
- Zod for runtime validation on all API inputs
- API response format: `{ data: ... }` or `{ error: "..." }` with appropriate HTTP status
- All prices stored as Decimal(10,2)
- Mobile-first responsive design

## Sibling Project
The wonders-ccg-platform at `../wonders-ccg-platform/` provides card gameplay data via API on port 8001. Card data is synced via `src/lib/platform/client.ts`, not shared at DB level.
