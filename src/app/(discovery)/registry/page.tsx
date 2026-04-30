// Public Stonefoil + OCM registry. Lists every serialised card variant in
// the catalog with the count of public claims. Available without auth — the
// registry is the outward face of the collector ecosystem.

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type SearchParams = {
  treatment?: string;
  set?: string;
  page?: string;
};

export default async function RegistryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const treatment = sp.treatment === "Stonefoil" || sp.treatment === "OCM" ? sp.treatment : null;
  const setCode = sp.set ?? null;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10));
  const limit = 50;

  const where: Record<string, unknown> = { isSerialized: true };
  if (treatment) where.treatment = treatment;
  else where.treatment = { in: ["Stonefoil", "OCM"] };
  if (setCode) where.set = { code: setCode };

  const [variants, total, sets] = await Promise.all([
    prisma.card.findMany({
      where,
      include: { set: { select: { code: true, name: true } } },
      orderBy: [{ set: { code: "asc" } }, { cardNumber: "asc" }, { treatment: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.card.count({ where }),
    prisma.set.findMany({
      where: { cards: { some: { isSerialized: true } } },
      select: { code: true, name: true },
      orderBy: { code: "asc" },
    }),
  ]);

  const cardIds = variants.map((v) => v.id);
  const claims =
    cardIds.length > 0
      ? await prisma.dragonScale.groupBy({
          by: ["cardId"],
          where: { cardId: { in: cardIds }, visibility: { not: "PRIVATE" } },
          _count: { _all: true },
        })
      : [];
  const claimsByCard = new Map(claims.map((c) => [c.cardId, c._count._all]));

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="container mx-auto py-8 px-4 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Stonefoil + OCM Registry</h1>
        <p className="text-sm text-muted-foreground">
          Every serialised Wonders card. Hunters who&apos;ve claimed a copy on StoneTrade can choose
          to advertise their name or stay anonymous. Click a row to see slot-by-slot detail.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 mb-4 text-sm">
        <RegistryFilter label="All" href={qs({ treatment: null, set: setCode })} active={!treatment} />
        <RegistryFilter label="Stonefoil" href={qs({ treatment: "Stonefoil", set: setCode })} active={treatment === "Stonefoil"} />
        <RegistryFilter label="OCM" href={qs({ treatment: "OCM", set: setCode })} active={treatment === "OCM"} />
        <span className="mx-1 text-muted-foreground">·</span>
        <RegistryFilter label="All sets" href={qs({ treatment, set: null })} active={!setCode} />
        {sets.map((s) => (
          <RegistryFilter
            key={s.code}
            label={s.code}
            href={qs({ treatment, set: s.code })}
            active={setCode === s.code}
          />
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {total.toLocaleString()} variant{total === 1 ? "" : "s"}
            {treatment ? ` · ${treatment} only` : ""}
            {setCode ? ` · ${setCode}` : ""}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Card</th>
                  <th className="text-left px-3 py-2 font-medium">Set</th>
                  <th className="text-left px-3 py-2 font-medium">Rarity</th>
                  <th className="text-left px-3 py-2 font-medium">Treatment</th>
                  <th className="text-right px-3 py-2 font-medium">Print run</th>
                  <th className="text-right px-3 py-2 font-medium">Public claims</th>
                </tr>
              </thead>
              <tbody>
                {variants.map((v) => {
                  const claimCount = claimsByCard.get(v.id) ?? 0;
                  const bareNumber = v.cardNumber.split("/")[0];
                  return (
                    <tr key={v.id} className="border-t hover:bg-muted/30">
                      <td className="px-3 py-2">
                        <Link
                          href={`/registry/${v.set.code}/${bareNumber}`}
                          className="font-medium hover:underline"
                        >
                          {v.name}
                        </Link>
                        <div className="text-xs text-muted-foreground">{v.cardNumber}</div>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{v.set.code}</td>
                      <td className="px-3 py-2">{v.rarity}</td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className="text-xs">{v.treatment}</Badge>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {v.serialTotal != null ? `1 / ${v.serialTotal}` : "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {v.serialTotal != null
                          ? `${claimCount} / ${v.serialTotal}`
                          : claimCount.toString()}
                      </td>
                    </tr>
                  );
                })}
                {variants.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                      No serialised cards match the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 text-sm">
              <span className="text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <div className="flex gap-2">
                {page > 1 && (
                  <Link
                    href={qs({ treatment, set: setCode, page: page - 1 })}
                    className="underline"
                  >
                    ← prev
                  </Link>
                )}
                {page < totalPages && (
                  <Link
                    href={qs({ treatment, set: setCode, page: page + 1 })}
                    className="underline"
                  >
                    next →
                  </Link>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function qs(params: { treatment?: string | null; set?: string | null; page?: number }): string {
  const q = new URLSearchParams();
  if (params.treatment) q.set("treatment", params.treatment);
  if (params.set) q.set("set", params.set);
  if (params.page && params.page > 1) q.set("page", String(params.page));
  const s = q.toString();
  return s ? `/registry?${s}` : "/registry";
}

function RegistryFilter({
  label,
  href,
  active,
}: {
  label: string;
  href: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`px-2 py-1 rounded-md border text-xs ${
        active ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"
      }`}
    >
      {label}
    </Link>
  );
}
