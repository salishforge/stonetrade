import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { CardGrid } from "@/components/cards/CardGrid";

interface SearchPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

interface SearchRow {
  id: string;
  cardNumber: string;
  name: string;
  treatment: string;
  rarity: string;
  imageUrl: string | null;
  setId: string;
  setName: string | null;
  setCode: string | null;
  marketMid: string | null;
  confidence: number | null;
  rank: number;
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const page = typeof params.page === "string" ? parseInt(params.page, 10) : 1;
  const limit = 24;
  const offset = (page - 1) * limit;

  if (!q) {
    return (
      <div className="container mx-auto py-8 px-4">
        <h1 className="text-3xl font-bold mb-4">Search</h1>
        <p className="text-muted-foreground">
          Use the search bar in the header to find cards by name or rules text.
        </p>
      </div>
    );
  }

  // Same FTS query as /api/search but inlined for server-side render.
  const rows = await prisma.$queryRaw<SearchRow[]>`
    SELECT
      c.id, c."cardNumber", c.name, c.treatment, c.rarity, c."imageUrl",
      c."setId",
      s.name AS "setName", s.code AS "setCode",
      mv."marketMid"::text AS "marketMid", mv.confidence AS confidence,
      ts_rank(c."searchVector", websearch_to_tsquery('english', ${q})) AS rank
    FROM "Card" c
    LEFT JOIN "Set" s ON s.id = c."setId"
    LEFT JOIN "CardMarketValue" mv ON mv."cardId" = c.id
    WHERE c."searchVector" @@ websearch_to_tsquery('english', ${q})
    ORDER BY rank DESC, c.name ASC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const totalRows = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM "Card" c
    WHERE c."searchVector" @@ websearch_to_tsquery('english', ${q})
  `;
  const total = Number(totalRows[0]?.count ?? 0);
  const totalPages = Math.ceil(total / limit);

  const cards = rows.map((r) => ({
    id: r.id,
    name: r.name,
    cardNumber: r.cardNumber,
    orbital: null,
    rarity: r.rarity,
    cardType: "",
    treatment: r.treatment,
    imageUrl: r.imageUrl,
    game: { name: "", slug: "" },
    set: { name: r.setName ?? "", code: r.setCode ?? "" },
    marketValue: r.marketMid ? { marketMid: r.marketMid, confidence: r.confidence ?? 0 } : null,
  }));

  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-2">Search</h1>
      <p className="text-sm text-muted-foreground mb-6">
        {total} result{total !== 1 ? "s" : ""} for{" "}
        <span className="font-medium text-foreground">&ldquo;{q}&rdquo;</span>
      </p>

      <CardGrid cards={cards} />

      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-8">
          {page > 1 && (
            <Link
              href={`/search?q=${encodeURIComponent(q)}&page=${page - 1}`}
              className="px-4 py-2 border rounded-md text-sm hover:bg-muted"
            >
              Previous
            </Link>
          )}
          <span className="px-4 py-2 text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={`/search?q=${encodeURIComponent(q)}&page=${page + 1}`}
              className="px-4 py-2 border rounded-md text-sm hover:bg-muted"
            >
              Next
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
