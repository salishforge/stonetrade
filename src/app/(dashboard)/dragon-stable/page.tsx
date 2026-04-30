// Dragon Stable — formed Dragons (≥10,000 points). Phase 1 only shows the
// user's personal Dragon; Phase 2 will add packs the user contributes to.

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DRAGON_POINT_THRESHOLD } from "@/lib/dragon/constants";

export default async function DragonStablePage() {
  const user = await getCurrentUser();
  if (!user) return <p>Please sign in.</p>;

  const personal = await prisma.dragonRegistration.findUnique({
    where: { ownerType_userOwnerId: { ownerType: "USER", userOwnerId: user.id } },
  });

  // Top contributing scales for the personal Dragon, surfaced as a quick
  // breakdown so the user can tell at a glance what carries their score.
  const topScales = personal
    ? await prisma.dragonScale.findMany({
        where: { userId: user.id },
        include: {
          card: { select: { name: true, cardNumber: true, set: { select: { code: true } } } },
        },
        orderBy: { pointsCached: "desc" },
        take: 10,
      })
    : [];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Dragon Stable</h1>
        <p className="text-sm text-muted-foreground">
          Your registered Dragons. A Dragon registers automatically once your binder
          reaches {DRAGON_POINT_THRESHOLD.toLocaleString()} Dragon Points.
        </p>
      </div>

      {!personal ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">
              No Dragons yet. Build your binder to register one.
            </p>
            <Link href="/dragon-scales">
              <Button>Open Dragon Binder</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between">
            <div>
              <CardTitle>{user.displayName ?? user.username}&apos;s Dragon</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Formed {personal.formedAt.toLocaleDateString()} · last recalculated{" "}
                {personal.lastRecalculatedAt.toLocaleString()}
              </p>
            </div>
            {personal.dissolvedAt == null ? (
              <Badge variant="default">Active</Badge>
            ) : (
              <Badge variant="outline">
                Dissolved {personal.dissolvedAt.toLocaleDateString()}
              </Badge>
            )}
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <p className="text-xs text-muted-foreground">Current Strength</p>
              <p className="text-3xl font-bold">
                {personal.currentPoints.toLocaleString()}
                <span className="text-base font-normal text-muted-foreground">
                  {" Dragon Points"}
                </span>
              </p>
            </div>

            {topScales.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-2">Top Contributing Scales</h3>
                <div className="border rounded-md overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium">Card</th>
                        <th className="text-left px-3 py-2 font-medium">Treatment</th>
                        <th className="text-right px-3 py-2 font-medium">Qty</th>
                        <th className="text-right px-3 py-2 font-medium">Points</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topScales.map((s) => (
                        <tr key={s.id} className="border-t">
                          <td className="px-3 py-2">
                            <div className="font-medium">{s.card.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {s.card.set.code} · {s.card.cardNumber}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <Badge variant="outline" className="text-xs">{s.treatment}</Badge>
                          </td>
                          <td className="px-3 py-2 text-right">{s.quantity}</td>
                          <td className="px-3 py-2 text-right font-medium">
                            {s.pointsCached.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground mt-6">
        Coming soon: Dragons formed by a Hunting Pack will appear here too.
      </p>
    </div>
  );
}
