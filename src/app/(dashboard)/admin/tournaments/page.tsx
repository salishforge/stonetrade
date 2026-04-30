// Admin: tournament list + creation form. Gates on UserRole = ADMIN.

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getAdminUser } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreateTournamentForm } from "./CreateTournamentForm";

export default async function AdminTournamentsPage() {
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

  const events = await prisma.tournamentEvent.findMany({
    orderBy: { eventDate: "desc" },
    include: { _count: { select: { registrations: true } } },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Admin · Tournaments</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-3">
          <h2 className="text-base font-semibold">Events</h2>
          {events.length === 0 ? (
            <Card>
              <CardContent className="py-6 text-sm text-muted-foreground text-center">
                No events yet — create one with the form on the right.
              </CardContent>
            </Card>
          ) : (
            events.map((e) => (
              <Link key={e.id} href={`/admin/tournaments/${e.slug}`} className="block">
                <Card className="hover:bg-muted/30 transition-colors">
                  <CardHeader className="flex flex-row items-start justify-between pb-2">
                    <div>
                      <CardTitle className="text-base">{e.name}</CardTitle>
                      <p className="text-xs text-muted-foreground mt-1">
                        {e.eventDate.toLocaleDateString()} · {e._count.registrations} registered ·
                        ${Number(e.basePrizePool).toLocaleString()} base + ${Number(e.dragonGoldPool).toLocaleString()} Dragon Gold
                      </p>
                    </div>
                    <Badge variant="outline">{e.status.replace(/_/g, " ").toLowerCase()}</Badge>
                  </CardHeader>
                </Card>
              </Link>
            ))
          )}
        </div>

        <div>
          <h2 className="text-base font-semibold mb-3">Create event</h2>
          <CreateTournamentForm />
        </div>
      </div>
    </div>
  );
}
