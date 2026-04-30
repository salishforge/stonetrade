// Hunting Pack detail. Members + pooled Dragon strength + invite controls.
// Contract is a separate sub-page to keep the surface area readable.

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DRAGON_POINT_THRESHOLD } from "@/lib/dragon/constants";
import { InviteForm } from "./InviteForm";
import { LeavePackButton } from "./LeavePackButton";

export default async function PackDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) return <p>Please sign in.</p>;
  const { slug } = await params;

  const pack = await prisma.huntingPack.findUnique({
    where: { slug },
    include: {
      members: {
        where: { leftAt: null },
        include: {
          user: { select: { id: true, username: true, displayName: true } },
        },
        orderBy: { joinedAt: "asc" },
      },
      invitations: {
        where: { status: "PENDING" },
        include: {
          inviter: { select: { username: true, displayName: true } },
        },
        orderBy: { createdAt: "desc" },
      },
      contract: { select: { id: true, status: true, currentVersionId: true } },
      registrations: {
        where: { ownerType: "PACK" },
        include: { dragonRider: { select: { id: true, username: true, displayName: true } } },
        orderBy: { formedAt: "desc" },
        take: 1,
      },
    },
  });
  if (!pack) notFound();
  const isMember = pack.members.some((m) => m.userId === user.id);
  if (!isMember) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          You&apos;re not a member of this pack.
        </CardContent>
      </Card>
    );
  }

  // Per-member contribution to the pack pool. Surfaced inline so each
  // member can see what they bring to the Dragon at a glance.
  const contributions = await prisma.dragonScale.groupBy({
    by: ["userId"],
    where: { userId: { in: pack.members.map((m) => m.userId) } },
    _sum: { pointsCached: true },
  });
  const contributionByUser = new Map<string, number>();
  for (const c of contributions) {
    contributionByUser.set(c.userId, c._sum.pointsCached ?? 0);
  }

  const reg = pack.registrations[0];
  const totalPoints = reg?.currentPoints ?? 0;
  const pct = Math.min(100, Math.round((totalPoints / DRAGON_POINT_THRESHOLD) * 100));
  const isFounder = pack.members.find((m) => m.userId === user.id)?.role === "FOUNDER";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-muted-foreground">Hunting Pack</p>
          <h1 className="text-2xl font-bold">{pack.name}</h1>
          <p className="text-xs text-muted-foreground">@{pack.slug}</p>
        </div>
        <div className="flex gap-2">
          <Link href={`/hunting-packs/${pack.slug}/contract`}>
            <Button variant="outline">
              {pack.contract ? `Contract — ${pack.contract.status.replace(/_/g, " ").toLowerCase()}` : "Draft contract"}
            </Button>
          </Link>
        </div>
      </div>

      <Card>
        <CardContent className="pt-4 space-y-2">
          <div className="flex items-baseline justify-between">
            <p className="text-xs text-muted-foreground">Pack Dragon Strength</p>
            {reg && reg.dissolvedAt == null ? (
              <Badge>Registered</Badge>
            ) : reg?.dissolvedAt ? (
              <Badge variant="outline">Dissolved</Badge>
            ) : (
              <Badge variant="outline">Forming</Badge>
            )}
          </div>
          <p className="text-2xl font-bold">
            {totalPoints.toLocaleString()}
            <span className="text-base font-normal text-muted-foreground">
              {" / "}
              {DRAGON_POINT_THRESHOLD.toLocaleString()}
            </span>
          </p>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
          {reg?.dragonRider && (
            <p className="text-xs text-muted-foreground pt-1">
              Dragon Rider: <span className="font-medium">{reg.dragonRider.displayName ?? reg.dragonRider.username}</span>
            </p>
          )}
          {!reg?.dragonRider && reg && reg.dissolvedAt == null && (
            <p className="text-xs text-muted-foreground pt-1">
              No Dragon Rider appointed yet — propose a contract version naming one to compete.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Members ({pack.members.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Member</th>
                <th className="text-left px-3 py-2 font-medium">Role</th>
                <th className="text-left px-3 py-2 font-medium">Joined</th>
                <th className="text-right px-3 py-2 font-medium">Points contributed</th>
              </tr>
            </thead>
            <tbody>
              {pack.members.map((m) => (
                <tr key={m.id} className="border-t">
                  <td className="px-3 py-2">
                    {m.user.displayName ?? m.user.username}{" "}
                    <span className="text-xs text-muted-foreground">@{m.user.username}</span>
                  </td>
                  <td className="px-3 py-2">{m.role.toLowerCase()}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {m.joinedAt.toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2 text-right font-medium">
                    {(contributionByUser.get(m.userId) ?? 0).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Invite a member</CardTitle>
          </CardHeader>
          <CardContent>
            <InviteForm packId={pack.id} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Pending invitations</CardTitle>
          </CardHeader>
          <CardContent>
            {pack.invitations.length === 0 ? (
              <p className="text-sm text-muted-foreground">No pending invitations.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {pack.invitations.map((i) => (
                  <li key={i.id} className="flex items-center justify-between border rounded-md px-3 py-2">
                    <div>
                      <span className="font-medium">{i.inviteeEmail}</span>
                      <p className="text-xs text-muted-foreground">
                        invited by {i.inviter.displayName ?? i.inviter.username} ·{" "}
                        expires {i.expiresAt.toLocaleDateString()}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end pt-4 border-t">
        <LeavePackButton packId={pack.id} disabled={isFounder && pack.members.length > 1} disabledReason={isFounder && pack.members.length > 1 ? "Founder cannot leave while other members remain" : undefined} />
      </div>
    </div>
  );
}
