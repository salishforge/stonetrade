// Public-facing tournaments list. Public discovery group; no auth gate
// because the calendar is public. Hunters click into a detail page to
// register their Dragon when registration is open.

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function TournamentsPage() {
  const events = await prisma.tournamentEvent.findMany({
    orderBy: { eventDate: "desc" },
    include: { _count: { select: { registrations: true } } },
  });

  return (
    <div className="container mx-auto py-8 px-4 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Dragon Cup Tournaments</h1>
        <p className="text-sm text-muted-foreground">
          Events where Dragons compete for the Dragon Gold Pool. Registered Dragons must have a ratified contract (for packs) and an appointed Dragon Rider.
        </p>
      </div>

      {events.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No tournaments scheduled yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {events.map((e) => (
            <Link key={e.id} href={`/tournaments/${e.slug}`} className="block">
              <Card className="hover:bg-muted/30 transition-colors">
                <CardHeader className="flex flex-row items-start justify-between pb-2">
                  <div>
                    <CardTitle className="text-base">{e.name}</CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                      {e.eventDate.toLocaleDateString()} · {e._count.registrations} registered
                    </p>
                  </div>
                  <Badge variant="outline">
                    {e.status.replace(/_/g, " ").toLowerCase()}
                  </Badge>
                </CardHeader>
                <CardContent className="text-sm">
                  <div className="flex gap-6 text-muted-foreground">
                    <span>
                      Base pool: <strong className="text-foreground">${Number(e.basePrizePool).toLocaleString()}</strong>
                    </span>
                    <span>
                      Dragon Gold pool: <strong className="text-foreground">${Number(e.dragonGoldPool).toLocaleString()}</strong>
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
