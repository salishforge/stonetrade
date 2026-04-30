import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

// Revoke a pending pack invitation. Only the inviter (or any pack member)
// can revoke. Already-responded invitations cannot be revoked — they are
// historical record at that point.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; invId: string }> },
) {
  const user = await requireUser();
  const { id, invId } = await params;

  const invitation = await prisma.packInvitation.findUnique({
    where: { id: invId },
    include: { pack: { include: { members: { where: { leftAt: null } } } } },
  });
  if (!invitation || invitation.packId !== id) {
    return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
  }
  const isMember = invitation.pack.members.some((m) => m.userId === user.id);
  if (!isMember) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (invitation.status !== "PENDING") {
    return NextResponse.json({ error: "Invitation already responded" }, { status: 400 });
  }

  await prisma.packInvitation.update({
    where: { id: invId },
    data: { status: "REVOKED", respondedAt: new Date() },
  });

  return NextResponse.json({ data: { revoked: true } });
}
