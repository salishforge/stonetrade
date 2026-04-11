import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { CardGrid } from "@/components/cards/CardGrid";
import { SearchFilters } from "@/components/marketplace/SearchFilters";
import { Skeleton } from "@/components/ui/skeleton";

interface BrowsePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function BrowsePage({ searchParams }: BrowsePageProps) {
  const params = await searchParams;

  const game = typeof params.game === "string" ? params.game : undefined;
  const orbital = typeof params.orbital === "string" ? params.orbital : undefined;
  const rarity = typeof params.rarity === "string" ? params.rarity : undefined;
  const treatment = typeof params.treatment === "string" ? params.treatment : undefined;
  const cardType = typeof params.cardType === "string" ? params.cardType : undefined;
  const search = typeof params.q === "string" ? params.q : undefined;
  const page = typeof params.page === "string" ? parseInt(params.page, 10) : 1;
  const limit = 40;

  const where: Record<string, unknown> = {};
  if (game) where.game = { slug: game };
  if (orbital) where.orbital = orbital;
  if (rarity) where.rarity = rarity;
  if (treatment) where.treatment = treatment;
  if (cardType) where.cardType = cardType;
  if (search) where.name = { contains: search, mode: "insensitive" };

  // Default to Classic Paper if no treatment specified
  if (!treatment) where.treatment = "Classic Paper";

  const [cards, total] = await Promise.all([
    prisma.card.findMany({
      where,
      include: {
        game: { select: { name: true, slug: true } },
        set: { select: { name: true, code: true } },
        marketValue: {
          select: { marketMid: true, confidence: true, marketLow: true, marketHigh: true },
        },
      },
      orderBy: { cardNumber: "asc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.card.count({ where }),
  ]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-6">Browse Cards</h1>
      <div className="flex gap-8">
        {/* Sidebar Filters */}
        <aside className="w-56 shrink-0 hidden lg:block">
          <Suspense fallback={<Skeleton className="h-96 w-full" />}>
            <SearchFilters />
          </Suspense>
        </aside>

        {/* Card Grid */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-muted-foreground">
              {total} card{total !== 1 ? "s" : ""} found
            </p>
          </div>

          <CardGrid cards={cards as Parameters<typeof CardGrid>[0]["cards"]} />

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-8">
              {page > 1 && (
                <a
                  href={`/browse?${new URLSearchParams({ ...Object.fromEntries(Object.entries(params).filter(([, v]) => typeof v === "string") as [string, string][]), page: String(page - 1) }).toString()}`}
                  className="px-4 py-2 border rounded-md text-sm hover:bg-muted"
                >
                  Previous
                </a>
              )}
              <span className="px-4 py-2 text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              {page < totalPages && (
                <a
                  href={`/browse?${new URLSearchParams({ ...Object.fromEntries(Object.entries(params).filter(([, v]) => typeof v === "string") as [string, string][]), page: String(page + 1) }).toString()}`}
                  className="px-4 py-2 border rounded-md text-sm hover:bg-muted"
                >
                  Next
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
