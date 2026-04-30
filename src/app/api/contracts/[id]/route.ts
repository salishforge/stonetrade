import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

// Full contract view: every version with its signatories + signatures, plus
// the audit log. Only members of the pack the contract belongs to may read
// it.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  const { id } = await params;

  const contract = await prisma.packContract.findUnique({
    where: { id },
    include: {
      pack: {
        include: { members: { where: { leftAt: null } } },
      },
      versions: {
        include: {
          createdBy: { select: { id: true, username: true, displayName: true } },
          dragonRider: { select: { id: true, username: true, displayName: true } },
          signatories: {
            include: {
              user: { select: { id: true, username: true, displayName: true } },
              signature: true,
            },
            orderBy: { id: "asc" },
          },
        },
        orderBy: { versionNumber: "desc" },
      },
      auditLog: {
        include: {
          actor: { select: { id: true, username: true, displayName: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 200,
      },
    },
  });
  if (!contract) return NextResponse.json({ error: "Contract not found" }, { status: 404 });
  const isMember = contract.pack.members.some((m) => m.userId === user.id);
  if (!isMember) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return NextResponse.json({ data: contract });
}
