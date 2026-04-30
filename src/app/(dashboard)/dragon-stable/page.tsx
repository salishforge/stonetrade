// Dragon Stable — every formed Dragon (≥10,000 points) the current user
// participates in: their own, plus any pack they're a current member of.

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DRAGON_POINT_THRESHOLD } from "@/lib/dragon/constants";
import { AppointPersonalRider } from "./AppointPersonalRider";

export default async function DragonStablePage() {
  const user = await getCurrentUser();
  if (!user) return <p>Please sign in.</p>;

  const personal = await prisma.dragonRegistration.findUnique({
    where: { ownerType_userOwnerId: { ownerType: "USER", userOwnerId: user.id } },
    include: { dragonRider: { select: { id: true, username: true, displayName: true } } },
  });

  const memberships = await prisma.huntingPackMember.findMany({
    where: { userId: user.id, leftAt: null },
    select: { packId: true },
  });
  const packDragons = memberships.length
    ? await prisma.dragonRegistration.findMany({
        where: { ownerType: "PACK", packOwnerId: { in: memberships.map((m) => m.packId) } },
        include: {
          packOwner: { select: { id: true, name: true, slug: true } },
          dragonRider: { select: { id: true, username: true, displayName: true } },
        },
        orderBy: { formedAt: "desc" },
      })
    : [];

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

  const hasNoDragons = !personal && packDragons.length === 0;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Dragon Stable</h1>
        <p className="text-sm text-muted-foreground">
          Your registered Dragons. A Dragon registers automatically once a binder reaches{" "}
          {DRAGON_POINT_THRESHOLD.toLocaleString()} Dragon Points.
        </p>
      </div>

      {hasNoDragons ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">
              No Dragons yet. Build your binder or join a Hunting Pack to register one.
            </p>
            <div className="flex gap-2 justify-center">
              <Link href="/dragon-scales">
                <Button>Open Dragon Binder</Button>
              </Link>
              <Link href="/hunting-packs">
                <Button variant="outline">Hunting Packs</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {personal && (
            <Card>
              <CardHeader className="flex flex-row items-start justify-between">
                <div>
                  <CardTitle>{user.displayName ?? user.username}&apos;s Dragon</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    Personal · formed {personal.formedAt.toLocaleDateString()} · last recalculated{" "}
                    {personal.lastRecalculatedAt.toLocaleString()}
                  </p>
                </div>
                {personal.dissolvedAt == null ? (
                  <Badge>Active</Badge>
                ) : (
                  <Badge variant="outline">
                    Dissolved {personal.dissolvedAt.toLocaleDateString()}
                  </Badge>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-xs text-muted-foreground">Current Strength</p>
                  <p className="text-3xl font-bold">
                    {personal.currentPoints.toLocaleString()}
                    <span className="text-base font-normal text-muted-foreground">
                      {" Dragon Points"}
                    </span>
                  </p>
                </div>

                <div className="border-t pt-3">
                  <p className="text-xs text-muted-foreground mb-2">Dragon Rider</p>
                  {personal.dragonRider ? (
                    <p className="font-medium">
                      {personal.dragonRider.displayName ?? personal.dragonRider.username}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground mb-2">
                      Not appointed. The PDF requires a Stoneseeker rider before tournament play.
                    </p>
                  )}
                  <div className="mt-2">
                    <AppointPersonalRider currentRiderId={personal.dragonRider?.id ?? null} />
                  </div>
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

          {packDragons.map((pd) => (
            <Card key={pd.id}>
              <CardHeader className="flex flex-row items-start justify-between">
                <div>
                  <CardTitle>
                    <Link href={`/hunting-packs/${pd.packOwner?.slug ?? ""}`} className="hover:underline">
                      {pd.packOwner?.name ?? "Pack Dragon"}
                    </Link>
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    Hunting Pack · formed {pd.formedAt.toLocaleDateString()} · last recalculated{" "}
                    {pd.lastRecalculatedAt.toLocaleString()}
                  </p>
                </div>
                {pd.dissolvedAt == null ? (
                  <Badge>Active</Badge>
                ) : (
                  <Badge variant="outline">
                    Dissolved {pd.dissolvedAt.toLocaleDateString()}
                  </Badge>
                )}
              </CardHeader>
              <CardContent className="space-y-2">
                <div>
                  <p className="text-xs text-muted-foreground">Pooled Strength</p>
                  <p className="text-3xl font-bold">
                    {pd.currentPoints.toLocaleString()}
                    <span className="text-base font-normal text-muted-foreground">
                      {" Dragon Points"}
                    </span>
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Dragon Rider</p>
                  <p className="text-sm">
                    {pd.dragonRider
                      ? pd.dragonRider.displayName ?? pd.dragonRider.username
                      : "— not appointed (set via the pack contract) —"}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
