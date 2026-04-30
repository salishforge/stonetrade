import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

// Pending invitations addressed to the current user — by stored userId or
// (for invitations sent before the user signed up) by email match.
export async function GET() {
  const user = await requireUser();

  const invitations = await prisma.packInvitation.findMany({
    where: {
      status: "PENDING",
      expiresAt: { gt: new Date() },
      OR: [{ inviteeUserId: user.id }, { inviteeEmail: user.email }],
    },
    include: {
      pack: { select: { id: true, name: true, slug: true } },
      inviter: { select: { id: true, username: true, displayName: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ data: invitations });
}
