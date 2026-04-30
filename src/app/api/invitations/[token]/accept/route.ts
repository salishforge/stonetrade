import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { recalculatePackDragon } from "@/lib/dragon/recalculate";
import { recordAudit } from "@/lib/contracts/audit";

// Accept a pending invitation. The accepter must be signed in; if their
// email doesn't match the addressed email and the invitation didn't pre-
// resolve to their userId, the request is rejected (a leaked token must not
// add the wrong person to a pack). After accept, the user joins the pack
// and the pack Dragon recomputes.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const user = await requireUser();
  const { token } = await params;

  const invitation = await prisma.packInvitation.findUnique({
    where: { token },
    include: { pack: { include: { contract: true } } },
  });
  if (!invitation) return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
  if (invitation.status !== "PENDING") {
    return NextResponse.json({ error: `Invitation is ${invitation.status}` }, { status: 400 });
  }
  if (invitation.expiresAt <= new Date()) {
    await prisma.packInvitation.update({
      where: { id: invitation.id },
      data: { status: "EXPIRED", respondedAt: new Date() },
    });
    return NextResponse.json({ error: "Invitation expired" }, { status: 400 });
  }

  const isAddressedToMe =
    invitation.inviteeUserId === user.id || invitation.inviteeEmail === user.email;
  if (!isAddressedToMe) {
    return NextResponse.json({ error: "This invitation is not for you" }, { status: 403 });
  }

  // Idempotency: if user already has an active membership, just mark accepted.
  const existing = await prisma.huntingPackMember.findFirst({
    where: { packId: invitation.packId, userId: user.id, leftAt: null },
  });

  await prisma.$transaction(async (tx) => {
    await tx.packInvitation.update({
      where: { id: invitation.id },
      data: {
        status: "ACCEPTED",
        respondedAt: new Date(),
        inviteeUserId: invitation.inviteeUserId ?? user.id,
      },
    });
    if (!existing) {
      await tx.huntingPackMember.create({
        data: { packId: invitation.packId, userId: user.id, role: "MEMBER" },
      });
    }
    if (invitation.pack.contract) {
      await recordAudit(tx, {
        contractId: invitation.pack.contract.id,
        actorUserId: user.id,
        action: "INVITATION_ACCEPTED",
        payload: { invitationId: invitation.id },
      });
      await recordAudit(tx, {
        contractId: invitation.pack.contract.id,
        actorUserId: user.id,
        action: "MEMBER_JOINED",
        payload: { userId: user.id },
      });
    }
  });

  await recalculatePackDragon(invitation.packId);

  return NextResponse.json({ data: { joined: true, packId: invitation.packId } });
}
