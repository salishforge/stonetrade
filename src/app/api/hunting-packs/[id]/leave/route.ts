import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { recalculatePackDragon } from "@/lib/dragon/recalculate";
import { recordAudit } from "@/lib/contracts/audit";

// A member leaves the pack. Soft-delete: HuntingPackMember.leftAt is set.
// Their scales contribute nothing to the pack going forward, so the pack
// Dragon recalcs immediately. The founder cannot leave a pack that still
// has other members — they must transfer founder role first (out of scope
// for Phase 2; founder can't currently leave at all).
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  const { id } = await params;

  const membership = await prisma.huntingPackMember.findFirst({
    where: { packId: id, userId: user.id, leftAt: null },
    include: { pack: { include: { contract: true } } },
  });
  if (!membership) {
    return NextResponse.json({ error: "Not a member of this pack" }, { status: 404 });
  }

  if (membership.role === "FOUNDER") {
    const otherMembers = await prisma.huntingPackMember.count({
      where: { packId: id, leftAt: null, NOT: { userId: user.id } },
    });
    if (otherMembers > 0) {
      return NextResponse.json(
        { error: "Founder cannot leave while other members remain" },
        { status: 400 },
      );
    }
  }

  await prisma.huntingPackMember.update({
    where: { id: membership.id },
    data: { leftAt: new Date() },
  });

  // Pack-level audit: only relevant when a contract exists. Member-leave is
  // a contract-relevant event because the named-parties list on the
  // ratified version no longer matches reality and a re-version will be
  // needed before the next signature event.
  if (membership.pack.contract) {
    await recordAudit(prisma, {
      contractId: membership.pack.contract.id,
      actorUserId: user.id,
      action: "MEMBER_LEFT",
      payload: { userId: user.id },
    });
  }

  await recalculatePackDragon(id);

  return NextResponse.json({ data: { left: true } });
}
