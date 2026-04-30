// Tournament detail. Lists every registered Dragon and (when results are
// in) shows the finishing order with payout breakdown. Registration UI is
// the RegisterDragonForm (rendered only when registration is open).

import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RegisterDragonForm } from "./RegisterDragonForm";

export default async function TournamentDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await getCurrentUser();

  const event = await prisma.tournamentEvent.findUnique({
    where: { slug },
    include: {
      registrations: {
        include: {
          dragon: {
            include: {
              userOwner: { select: { username: true, displayName: true } },
              packOwner: { select: { name: true, slug: true } },
            },
          },
          rider: { select: { id: true, username: true, displayName: true } },
          result: true,
        },
        orderBy: [
          { result: { finishingPosition: "asc" } },
          { createdAt: "asc" },
        ],
      },
    },
  });
  if (!event) notFound();

  const eligible = user
    ? await prisma.dragonRegistration.findMany({
        where: {
          dissolvedAt: null,
          OR: [
            { ownerType: "USER", userOwnerId: user.id },
            {
              ownerType: "PACK",
              packOwner: {
                members: { some: { userId: user.id, leftAt: null } },
                contract: { status: "RATIFIED" },
              },
            },
          ],
        },
        include: {
          userOwner: { select: { username: true } },
          packOwner: { select: { name: true } },
          dragonRider: { select: { id: true, username: true, displayName: true } },
        },
      })
    : [];

  const hasResults = event.registrations.some((r) => r.result);

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl space-y-6">
      <div>
        <p className="text-xs text-muted-foreground">Dragon Cup tournament</p>
        <h1 className="text-2xl font-bold">{event.name}</h1>
        <p className="text-sm text-muted-foreground">
          {event.eventDate.toLocaleString()} · {event.status.replace(/_/g, " ").toLowerCase()}
        </p>
        {event.description && <p className="text-sm mt-2">{event.description}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Base Prize Pool</p>
            <p className="text-2xl font-bold">${Number(event.basePrizePool).toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Top 16 finishers</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Dragon Gold Pool</p>
            <p className="text-2xl font-bold">${Number(event.dragonGoldPool).toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Top 32 by weighted points</p>
          </CardContent>
        </Card>
      </div>

      {user && event.status === "REGISTRATION_OPEN" && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Register your Dragon</CardTitle>
          </CardHeader>
          <CardContent>
            <RegisterDragonForm
              eventSlug={event.slug}
              eligible={eligible.map((d) => ({
                id: d.id,
                label:
                  d.ownerType === "USER"
                    ? `Personal Dragon (@${d.userOwner?.username})`
                    : `Pack: ${d.packOwner?.name}`,
                currentPoints: d.currentPoints,
                appointedRiderId: d.dragonRider?.id ?? null,
                appointedRiderLabel: d.dragonRider
                  ? d.dragonRider.displayName ?? d.dragonRider.username
                  : null,
              }))}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {hasResults ? "Results" : `Registered Dragons (${event.registrations.length})`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {event.registrations.length === 0 ? (
            <p className="text-sm text-muted-foreground">No registrations yet.</p>
          ) : (
            <div className="border rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    {hasResults && <th className="text-left px-3 py-2 font-medium">Finish</th>}
                    <th className="text-left px-3 py-2 font-medium">Dragon</th>
                    <th className="text-left px-3 py-2 font-medium">Rider</th>
                    <th className="text-right px-3 py-2 font-medium">Declared</th>
                    {hasResults && <th className="text-right px-3 py-2 font-medium">Weighted</th>}
                    {hasResults && <th className="text-right px-3 py-2 font-medium">Payout</th>}
                  </tr>
                </thead>
                <tbody>
                  {event.registrations.map((r) => {
                    const dragonLabel =
                      r.dragon.ownerType === "USER"
                        ? `Personal (@${r.dragon.userOwner?.username ?? "—"})`
                        : `Pack: ${r.dragon.packOwner?.name ?? "—"}`;
                    const totalCents =
                      (r.result?.basePayoutCents ?? 0) + (r.result?.dragonGoldPayoutCents ?? 0);
                    return (
                      <tr key={r.id} className="border-t">
                        {hasResults && (
                          <td className="px-3 py-2">
                            {r.result?.finishingPosition ? `#${r.result.finishingPosition}` : "—"}
                          </td>
                        )}
                        <td className="px-3 py-2">{dragonLabel}</td>
                        <td className="px-3 py-2">
                          {r.rider.displayName ?? r.rider.username}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {r.declaredPoints.toLocaleString()}
                        </td>
                        {hasResults && (
                          <td className="px-3 py-2 text-right">
                            {(r.result?.weightedPoints ?? 0).toLocaleString()}
                          </td>
                        )}
                        {hasResults && (
                          <td className="px-3 py-2 text-right font-medium">
                            {totalCents > 0 ? `$${(totalCents / 100).toLocaleString()}` : "—"}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {event.status === "COMPLETED" && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Payout breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Base prize pool paid</p>
                <p className="font-medium">
                  $
                  {(
                    event.registrations.reduce((s, r) => s + (r.result?.basePayoutCents ?? 0), 0) / 100
                  ).toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Dragon Gold paid</p>
                <p className="font-medium">
                  $
                  {(
                    event.registrations.reduce(
                      (s, r) => s + (r.result?.dragonGoldPayoutCents ?? 0),
                      0,
                    ) / 100
                  ).toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
