import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { createInvitationSchema } from "@/lib/validators/pack";
import { generateInvitationToken, invitationExpiry } from "@/lib/invitations/token";
import { recordAudit } from "@/lib/contracts/audit";
import { triggerNotification } from "@/lib/notify/novu";

// Send a pack invitation. Caller must be a current member of the pack.
// Email is the addressing primitive; if the email matches an existing User
// the invitee field is populated so they see the invite in their dashboard
// without having to follow the email link.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  const { id } = await params;
  const body = await request.json();
  const parsed = createInvitationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const pack = await prisma.huntingPack.findUnique({
    where: { id },
    include: {
      members: { where: { leftAt: null } },
      contract: true,
    },
  });
  if (!pack) return NextResponse.json({ error: "Pack not found" }, { status: 404 });
  const isMember = pack.members.some((m) => m.userId === user.id);
  if (!isMember) {
    return NextResponse.json({ error: "Only members can send invitations" }, { status: 403 });
  }

  // Resolve username → email if username was provided.
  let email = parsed.data.email;
  let inviteeUserId: string | null = null;
  if (parsed.data.username) {
    const found = await prisma.user.findUnique({
      where: { username: parsed.data.username },
      select: { id: true, email: true },
    });
    if (!found) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    email = found.email;
    inviteeUserId = found.id;
  } else if (email) {
    const found = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    inviteeUserId = found?.id ?? null;
  }
  if (!email) {
    return NextResponse.json({ error: "Email could not be resolved" }, { status: 400 });
  }

  // Don't reinvite an existing member or stack a duplicate pending invite.
  if (inviteeUserId) {
    const alreadyMember = pack.members.some((m) => m.userId === inviteeUserId);
    if (alreadyMember) {
      return NextResponse.json({ error: "User is already a member" }, { status: 409 });
    }
  }
  const existingPending = await prisma.packInvitation.findFirst({
    where: { packId: id, status: "PENDING", inviteeEmail: email },
  });
  if (existingPending) {
    return NextResponse.json({ error: "Invitation already pending" }, { status: 409 });
  }

  const invitation = await prisma.packInvitation.create({
    data: {
      packId: id,
      inviterUserId: user.id,
      inviteeEmail: email,
      inviteeUserId,
      token: generateInvitationToken(),
      expiresAt: invitationExpiry(),
    },
  });

  if (pack.contract) {
    await recordAudit(prisma, {
      contractId: pack.contract.id,
      actorUserId: user.id,
      action: "INVITATION_SENT",
      payload: { email, invitationId: invitation.id },
    });
  }

  // Notify the invitee. Fire-and-forget — the invite still exists in the
  // dashboard panel even if Novu is down or unconfigured.
  if (inviteeUserId) {
    await triggerNotification({
      workflowId: "pack-invite-received",
      to: { id: inviteeUserId, email },
      payload: {
        packName: pack.name,
        packSlug: pack.slug,
        token: invitation.token,
        inviterUsername: user.username,
      },
      transactionId: invitation.id,
    });
  }

  return NextResponse.json({ data: invitation }, { status: 201 });
}
