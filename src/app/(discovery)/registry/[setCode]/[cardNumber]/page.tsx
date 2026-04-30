// Per-card registry detail. For each serialised treatment of the card,
// shows the slot-by-slot claim status — claimed by named hunter, claimed
// anonymously, or unclaimed.

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function RegistryCardPage({
  params,
}: {
  params: Promise<{ setCode: string; cardNumber: string }>;
}) {
  const { setCode, cardNumber } = await params;

  const variants = await prisma.card.findMany({
    where: {
      isSerialized: true,
      OR: [{ cardNumber }, { cardNumber: { startsWith: `${cardNumber}/` } }],
      set: { code: setCode },
    },
    include: { set: { select: { code: true, name: true } } },
    orderBy: { treatment: "asc" },
  });
  if (variants.length === 0) notFound();

  const cardIds = variants.map((v) => v.id);
  const claims = await prisma.dragonScale.findMany({
    where: { cardId: { in: cardIds }, visibility: { not: "PRIVATE" } },
    select: {
      id: true,
      cardId: true,
      treatment: true,
      serialNumber: true,
      visibility: true,
      createdAt: true,
      user: { select: { username: true, displayName: true } },
    },
    orderBy: [{ treatment: "asc" }, { serialNumber: "asc" }, { createdAt: "asc" }],
  });

  // Group claims by cardId (treatment variant) for slot rendering.
  const claimsByCard = new Map<string, typeof claims>();
  for (const c of claims) {
    const list = claimsByCard.get(c.cardId) ?? [];
    list.push(c);
    claimsByCard.set(c.cardId, list);
  }

  const head = variants[0];
  return (
    <div className="container mx-auto py-8 px-4 max-w-3xl space-y-6">
      <div>
        <Link href="/registry" className="text-xs underline text-muted-foreground">
          ← back to registry
        </Link>
        <h1 className="text-2xl font-bold mt-1">{head.name}</h1>
        <p className="text-sm text-muted-foreground">
          {head.set.code} · {head.cardNumber} · {head.rarity}
        </p>
      </div>

      {variants.map((v) => {
        const variantClaims = claimsByCard.get(v.id) ?? [];
        return (
          <Card key={v.id}>
            <CardHeader className="flex flex-row items-start justify-between pb-2">
              <div>
                <CardTitle className="text-base">
                  <Badge variant="outline" className="mr-2">{v.treatment}</Badge>
                  {v.serialTotal != null
                    ? `Print run of ${v.serialTotal}`
                    : "Print run unknown"}
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  {variantClaims.length} of{" "}
                  {v.serialTotal != null ? v.serialTotal : "—"} publicly claimed
                </p>
              </div>
            </CardHeader>
            <CardContent>
              {variantClaims.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                  No public claims yet.
                </p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {variantClaims.map((c) => (
                    <li
                      key={c.id}
                      className="flex items-center justify-between border-b last:border-b-0 py-2"
                    >
                      <div>
                        <span className="font-mono text-xs text-muted-foreground mr-3">
                          {c.serialNumber ?? (v.treatment === "Stonefoil" ? "1/1" : "—")}
                        </span>
                        {c.visibility === "PUBLIC_NAMED" && c.user ? (
                          <span className="font-medium">
                            {c.user.displayName ?? c.user.username}
                          </span>
                        ) : (
                          <span className="text-muted-foreground italic">
                            Anonymous Hunter
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        claimed {c.createdAt.toLocaleDateString()}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
