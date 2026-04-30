// Hunting Packs landing — current memberships + pending invitations + a
// link to create a new pack.

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreatePackForm } from "./CreatePackForm";
import { InvitationsPanel } from "./InvitationsPanel";

export default async function HuntingPacksPage() {
  const user = await getCurrentUser();
  if (!user) return <p>Please sign in.</p>;

  const memberships = await prisma.huntingPackMember.findMany({
    where: { userId: user.id, leftAt: null },
    include: {
      pack: {
        include: {
          _count: { select: { members: { where: { leftAt: null } } } },
          contract: { select: { status: true } },
          registrations: {
            where: { ownerType: "PACK", dissolvedAt: null },
            select: { currentPoints: true },
          },
        },
      },
    },
    orderBy: { joinedAt: "desc" },
  });

  const invitations = await prisma.packInvitation.findMany({
    where: {
      status: "PENDING",
      expiresAt: { gt: new Date() },
      OR: [{ inviteeUserId: user.id }, { inviteeEmail: user.email }],
    },
    include: {
      pack: { select: { name: true, slug: true } },
      inviter: { select: { username: true, displayName: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Hunting Packs</h1>
        <p className="text-sm text-muted-foreground">
          Pool Dragon Scales with packmates. The combined collection forms a single Dragon when it crosses 10,000 points.
        </p>
      </div>

      <InvitationsPanel invitations={invitations} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-3">
          <h2 className="text-base font-semibold">My Packs</h2>
          {memberships.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                You&apos;re not in any Hunting Packs yet. Create one or accept an invitation.
              </CardContent>
            </Card>
          ) : (
            memberships.map((m) => {
              const dragonStrength = m.pack.registrations[0]?.currentPoints ?? 0;
              return (
                <Link key={m.id} href={`/hunting-packs/${m.pack.slug}`} className="block">
                  <Card className="hover:bg-muted/30 transition-colors">
                    <CardHeader className="flex flex-row items-start justify-between pb-2">
                      <div>
                        <CardTitle className="text-base">{m.pack.name}</CardTitle>
                        <p className="text-xs text-muted-foreground mt-1">
                          {m.pack._count.members} member{m.pack._count.members === 1 ? "" : "s"} · role: {m.role.toLowerCase()}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Badge variant="outline">
                          {m.pack.contract?.status ? m.pack.contract.status.replace(/_/g, " ").toLowerCase() : "no contract"}
                        </Badge>
                        {dragonStrength > 0 && (
                          <span className="text-xs text-muted-foreground">
                            Pack Dragon: {dragonStrength.toLocaleString()} pts
                          </span>
                        )}
                      </div>
                    </CardHeader>
                  </Card>
                </Link>
              );
            })
          )}
        </div>

        <div>
          <h2 className="text-base font-semibold mb-3">Create a Pack</h2>
          <CreatePackForm />
        </div>
      </div>
    </div>
  );
}
