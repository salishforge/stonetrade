// Token-landing page for an invite link emailed to a future pack member.
// The accept/decline POST endpoints both require auth, so a leaked token
// can't add an attacker to the pack. Already-handled invites show a
// summary instead.

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InvitationActions } from "./InvitationActions";

export default async function InvitationLandingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invitation = await prisma.packInvitation.findUnique({
    where: { token },
    include: {
      pack: { select: { name: true, slug: true } },
      inviter: { select: { username: true, displayName: true } },
    },
  });
  if (!invitation) notFound();

  const user = await getCurrentUser();

  const expired = invitation.expiresAt <= new Date();
  const handled = invitation.status !== "PENDING";

  return (
    <div className="max-w-md mx-auto py-12 space-y-4">
      <Card>
        <CardContent className="pt-6 space-y-3">
          <p className="text-xs text-muted-foreground">Hunting Pack invitation</p>
          <h1 className="text-2xl font-bold">{invitation.pack.name}</h1>
          <p className="text-sm">
            Invited by{" "}
            <span className="font-medium">
              {invitation.inviter.displayName ?? invitation.inviter.username}
            </span>{" "}
            on {invitation.createdAt.toLocaleDateString()}.
          </p>
          {expired && !handled && <Badge variant="outline">Expired</Badge>}
          {handled && (
            <Badge variant="outline">
              {invitation.status.toLowerCase()}
              {invitation.respondedAt
                ? ` — ${invitation.respondedAt.toLocaleString()}`
                : ""}
            </Badge>
          )}

          {!user ? (
            <p className="text-sm">
              <Link href={`/login?next=/invitations/${token}`} className="underline">
                Sign in
              </Link>{" "}
              to accept or decline.
            </p>
          ) : !handled && !expired ? (
            <InvitationActions token={token} packSlug={invitation.pack.slug} />
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
