import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Public-by-token landing endpoint. Returns the invitation context the
// invitee needs to decide accept / decline — no auth required to look up,
// since the invite link is the bearer token. Accept/decline POSTs DO require
// auth, so a leaked token can't be used to add an attacker to the pack.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const invitation = await prisma.packInvitation.findUnique({
    where: { token },
    include: {
      pack: { select: { id: true, name: true, slug: true } },
      inviter: { select: { username: true, displayName: true } },
    },
  });
  if (!invitation) {
    return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
  }
  return NextResponse.json({ data: invitation });
}
