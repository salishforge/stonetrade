import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { CardGrid } from "@/components/cards/CardGrid";
import { SearchFilters } from "@/components/marketplace/SearchFilters";
import { Skeleton } from "@/components/ui/skeleton";

// Filter changes update searchParams; force-dynamic skips Next's Router
// Cache so each filter selection triggers a fresh server render.
export const dynamic = "force-dynamic";

interface BrowsePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

interface BrowseRow {
  id: string;
  cardNumber: string;
  name: string;
  treatment: string;
  rarity: string;
  cardType: string;
  orbital: string | null;
  imageUrl: string | null;
  gameId: string;
  gameName: string;
  gameSlug: string;
  setId: string;
  setName: string;
  setCode: string;
  marketMid: string | null;
  marketLow: string | null;
  marketHigh: string | null;
  confidence: number | null;
}

const SORT_CLAUSES: Record<string, string> = {
  cardNumber: 'c."cardNumber" ASC',
  name: 'c.name ASC',
  rarity: 'c.rarity ASC, c."cardNumber" ASC',
  "price-low": 'mv."marketMid" ASC NULLS LAST, c."cardNumber" ASC',
  "price-high": 'mv."marketMid" DESC NULLS LAST, c."cardNumber" ASC',
};

export default async function BrowsePage({ searchParams }: BrowsePageProps) {
  const params = await searchParams;

  const game = typeof params.game === "string" ? params.game : undefined;
  const set = typeof params.set === "string" ? params.set : undefined;
  const orbital = typeof params.orbital === "string" ? params.orbital : undefined;
  const rarity = typeof params.rarity === "string" ? params.rarity : undefined;
  const treatment = typeof params.treatment === "string" ? params.treatment : "Classic Paper";
  const cardType = typeof params.cardType === "string" ? params.cardType : undefined;
  const search = typeof params.q === "string" ? params.q.trim() : undefined;
  const sort = typeof params.sort === "string" && params.sort in SORT_CLAUSES ? params.sort : "cardNumber";
  const page = typeof params.page === "string" ? Math.max(1, parseInt(params.page, 10) || 1) : 1;
  const limit = 40;
  const offset = (page - 1) * limit;

  // Build WHERE as parameterized fragments. Prisma raw queries handle the
  // escaping; we only ever interpolate scalars into placeholders.
  const conditions: string[] = ['c.treatment = $1'];
  const values: unknown[] = [treatment];
  let placeholderIndex = 2;
  if (game) { conditions.push(`g.slug = $${placeholderIndex++}`); values.push(game); }
  if (set) { conditions.push(`s.code = $${placeholderIndex++}`); values.push(set); }
  if (orbital) { conditions.push(`c.orbital = $${placeholderIndex++}`); values.push(orbital); }
  if (rarity) { conditions.push(`c.rarity = $${placeholderIndex++}`); values.push(rarity); }
  if (cardType) { conditions.push(`c."cardType" = $${placeholderIndex++}`); values.push(cardType); }
  if (search) { conditions.push(`c.name ILIKE $${placeholderIndex++}`); values.push(`%${search}%`); }

  const whereSQL = conditions.join(" AND ");
  // Cards with images come first; cards lacking imageUrl drop to the end.
  // Then secondary sort per the user's chosen sort.
  const orderSQL = `(c."imageUrl" IS NULL OR c."imageUrl" = '') ASC, ${SORT_CLAUSES[sort]}`;

  const sql = `
    SELECT c.id, c."cardNumber", c.name, c.treatment, c.rarity, c."cardType",
           c.orbital, c."imageUrl",
           g.id AS "gameId", g.name AS "gameName", g.slug AS "gameSlug",
           s.id AS "setId", s.name AS "setName", s.code AS "setCode",
           mv."marketMid"::text AS "marketMid",
           mv."marketLow"::text AS "marketLow",
           mv."marketHigh"::text AS "marketHigh",
           mv.confidence AS confidence
    FROM "Card" c
    JOIN "Game" g ON g.id = c."gameId"
    JOIN "Set" s ON s.id = c."setId"
    LEFT JOIN "CardMarketValue" mv ON mv."cardId" = c.id
    WHERE ${whereSQL}
    ORDER BY ${orderSQL}
    LIMIT ${limit} OFFSET ${offset}
  `;
  const countSQL = `
    SELECT COUNT(*)::bigint AS count
    FROM "Card" c
    JOIN "Game" g ON g.id = c."gameId"
    JOIN "Set" s ON s.id = c."setId"
    WHERE ${whereSQL}
  `;

  const [rows, totalRows] = await Promise.all([
    prisma.$queryRawUnsafe<BrowseRow[]>(sql, ...values),
    prisma.$queryRawUnsafe<Array<{ count: bigint }>>(countSQL, ...values),
  ]);
  const total = Number(totalRows[0]?.count ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / limit));

  // Adapt to CardGrid's expected shape.
  const cards = rows.map((r) => ({
    id: r.id,
    name: r.name,
    cardNumber: r.cardNumber,
    orbital: r.orbital,
    rarity: r.rarity,
    cardType: r.cardType,
    treatment: r.treatment,
    imageUrl: r.imageUrl,
    game: { name: r.gameName, slug: r.gameSlug },
    set: { name: r.setName, code: r.setCode },
    marketValue: r.marketMid != null
      ? { marketMid: r.marketMid, confidence: r.confidence ?? 0 }
      : null,
  }));

  // Pagination href builder preserves the active filters.
  const filterEntries = Object.entries(params).filter(
    ([, v]) => typeof v === "string" && v.length > 0,
  ) as [string, string][];
  const pageHref = (n: number) =>
    `/browse?${new URLSearchParams([...filterEntries.filter(([k]) => k !== "page"), ["page", String(n)]]).toString()}`;

  return (
    <div className="container mx-auto py-8 px-4">
      {/* Page masthead — small caps eyebrow + title + result count. */}
      <header className="border-b border-border/40 pb-5 mb-8 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-muted mb-1">Showcase · Browse</p>
          <h1
            className="font-display text-[36px] leading-[1.05] tracking-[-0.012em] text-ink-primary"
            style={{ fontVariationSettings: "'opsz' 72" }}
          >
            All cards
          </h1>
        </div>
        <p className="font-mono text-[12px] tabular-nums text-ink-secondary">
          <span className="text-ink-primary text-[16px]">{total}</span>
          <span className="ml-1 uppercase tracking-[0.1em] text-[10px] text-ink-muted">
            card{total === 1 ? "" : "s"}
          </span>
        </p>
      </header>

      <div className="flex gap-8">
        {/* Sidebar Filters */}
        <aside className="w-56 shrink-0 hidden lg:block">
          <Suspense fallback={<Skeleton className="h-96 w-full" />}>
            <SearchFilters />
          </Suspense>
        </aside>

        {/* Card Grid */}
        <div className="flex-1 min-w-0">
          <CardGrid cards={cards} />

          {/* Pagination */}
          {totalPages > 1 && (
            <nav className="flex items-center justify-center gap-2 mt-10 font-mono text-[11px] uppercase tracking-[0.1em]">
              {page > 1 ? (
                <a href={pageHref(page - 1)} className="px-3 py-1.5 border border-border/60 rounded text-ink-secondary hover:text-ink-primary hover:border-gold/60 transition-colors">
                  ← Prev
                </a>
              ) : (
                <span className="px-3 py-1.5 border border-border/30 rounded text-ink-muted">← Prev</span>
              )}
              <span className="px-4 py-1.5 text-ink-muted tabular-nums">
                {page} / {totalPages}
              </span>
              {page < totalPages ? (
                <a href={pageHref(page + 1)} className="px-3 py-1.5 border border-border/60 rounded text-ink-secondary hover:text-ink-primary hover:border-gold/60 transition-colors">
                  Next →
                </a>
              ) : (
                <span className="px-3 py-1.5 border border-border/30 rounded text-ink-muted">Next →</span>
              )}
            </nav>
          )}
        </div>
      </div>
    </div>
  );
}
