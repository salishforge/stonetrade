import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { prisma } from "@/lib/prisma";

const querySchema = z.object({
  q: z.string().min(1).max(200),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

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

/**
 * Full-text search across cards. Backed by a Postgres-generated tsvector
 * column (weighted: name > cardNumber > rulesText > flavorText) with a GIN
 * index. Uses websearch_to_tsquery so user input like "fire AND wonder" or
 * quoted phrases works without sanitization.
 */
export async function GET(request: NextRequest) {
  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.issues }, { status: 400 });
  }

  const { q, page, limit } = parsed.data;
  const offset = (page - 1) * limit;

  // websearch_to_tsquery handles user-supplied text safely (no need to escape);
  // returns empty tsquery for whitespace-only inputs which we already reject above.
  const rows = await prisma.$queryRaw<SearchRow[]>`
    SELECT
      c.id,
      c."cardNumber",
      c.name,
      c.treatment,
      c.rarity,
      c."imageUrl",
      c."setId",
      s.name AS "setName",
      s.code AS "setCode",
      mv."marketMid"::text AS "marketMid",
      mv.confidence AS confidence,
      ts_rank(c."searchVector", websearch_to_tsquery('english', ${q})) AS rank
    FROM "Card" c
    LEFT JOIN "Set" s ON s.id = c."setId"
    LEFT JOIN "CardMarketValue" mv ON mv."cardId" = c.id
    WHERE c."searchVector" @@ websearch_to_tsquery('english', ${q})
    ORDER BY rank DESC, c.name ASC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const totalRow = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM "Card" c
    WHERE c."searchVector" @@ websearch_to_tsquery('english', ${q})
  `;
  const total = Number(totalRow[0]?.count ?? 0);

  return NextResponse.json({
    data: rows.map((r) => ({
      id: r.id,
      cardNumber: r.cardNumber,
      name: r.name,
      treatment: r.treatment,
      rarity: r.rarity,
      imageUrl: r.imageUrl,
      set: r.setId ? { id: r.setId, name: r.setName, code: r.setCode } : null,
      marketValue: r.marketMid ? { marketMid: r.marketMid, confidence: r.confidence } : null,
      rank: Number(r.rank),
    })),
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
}
