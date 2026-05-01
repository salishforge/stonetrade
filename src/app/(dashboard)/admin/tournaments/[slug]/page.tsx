// Admin: enter results for a tournament. Shows every registration and lets
// the admin set finishing positions, then submits to the results endpoint
// which runs the payout engine.

import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getAdminUser } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResultsForm } from "./ResultsForm";
import { ComputeTrialsButton } from "./ComputeTrialsButton";

export default async function AdminTournamentDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const admin = await getAdminUser();
  if (!admin) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Admin only.
        </CardContent>
      </Card>
    );
  }
  const { slug } = await params;

  const event = await prisma.tournamentEvent.findUnique({
    where: { slug },
    include: {
      registrations: {
        include: {
          dragon: {
            include: {
              userOwner: { select: { username: true } },
              packOwner: { select: { name: true } },
            },
          },
          rider: { select: { username: true, displayName: true } },
          result: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!event) notFound();

  const initialResults = event.registrations.map((r) => ({
    registrationId: r.id,
    label:
      r.dragon.ownerType === "USER"
        ? `Personal Dragon (@${r.dragon.userOwner?.username})`
        : `Pack: ${r.dragon.packOwner?.name}`,
    riderLabel: r.rider.displayName ?? r.rider.username,
    declaredPoints: r.declaredPoints,
    finishingPosition: r.result?.finishingPosition ?? null,
  }));

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs text-muted-foreground">Admin</p>
        <h1 className="text-2xl font-bold">{event.name}</h1>
        <p className="text-xs text-muted-foreground">
          {event.eventDate.toLocaleString()} · ${Number(event.dragonGoldPool).toLocaleString()} Dragon Gold pool · {event.registrations.length} registered
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Enter results</CardTitle>
        </CardHeader>
        <CardContent>
          <ResultsForm slug={event.slug} entries={initialResults} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Hunting Trials</CardTitle>
          <p className="text-xs text-muted-foreground">
            Compute side categories (Top Dragon · Top 10 · Osprey per set). Idempotent — re-running replaces all prior award rows for this event.
          </p>
        </CardHeader>
        <CardContent>
          <ComputeTrialsButton slug={event.slug} />
        </CardContent>
      </Card>
    </div>
  );
}
