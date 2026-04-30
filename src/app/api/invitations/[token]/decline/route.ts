import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { recordAudit } from "@/lib/contracts/audit";

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
  const isAddressedToMe =
    invitation.inviteeUserId === user.id || invitation.inviteeEmail === user.email;
  if (!isAddressedToMe) {
    return NextResponse.json({ error: "This invitation is not for you" }, { status: 403 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.packInvitation.update({
      where: { id: invitation.id },
      data: { status: "DECLINED", respondedAt: new Date() },
    });
    if (invitation.pack.contract) {
      await recordAudit(tx, {
        contractId: invitation.pack.contract.id,
        actorUserId: user.id,
        action: "INVITATION_DECLINED",
        payload: { invitationId: invitation.id },
      });
    }
  });

  return NextResponse.json({ data: { declined: true } });
}
