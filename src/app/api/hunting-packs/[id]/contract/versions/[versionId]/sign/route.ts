import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { recordAudit } from "@/lib/contracts/audit";

// Sign one of the signatory roles for the user on this contract version.
// Body may include { role } to disambiguate when the user has multiple
// signatory rows (e.g. they are both PACK_MEMBER and DRAGON_RIDER); when
// omitted, all of the user's outstanding signatures on this version get
// recorded together.
//
// Once every requiredForRatification signatory has signed, the contract
// transitions to RATIFIED and any prior ratified version is implicitly
// superseded (currentVersionId already points at this version).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> },
) {
  const user = await requireUser();
  const { id: packId, versionId } = await params;

  const body = (await request.json().catch(() => ({}))) as { role?: string };
  const filterRole =
    body.role === "PACK_MEMBER" || body.role === "DRAGON_RIDER" ? body.role : null;

  const version = await prisma.contractVersion.findUnique({
    where: { id: versionId },
    include: {
      contract: { include: { pack: true } },
      signatories: { include: { signature: true } },
    },
  });
  if (!version || version.contract.pack.id !== packId) {
    return NextResponse.json({ error: "Contract version not found" }, { status: 404 });
  }

  const myOutstanding = version.signatories.filter(
    (s) => s.userId === user.id && !s.signature && (filterRole == null || s.role === filterRole),
  );
  if (myOutstanding.length === 0) {
    return NextResponse.json(
      { error: "No outstanding signature required from you on this version" },
      { status: 400 },
    );
  }

  const ipAddress =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = request.headers.get("user-agent");

  const newlySigned: { id: string; role: string }[] = [];

  await prisma.$transaction(async (tx) => {
    for (const signatory of myOutstanding) {
      await tx.contractSignature.create({
        data: {
          versionId,
          signatoryId: signatory.id,
          signedBodyHash: version.bodyHash,
          ipAddress,
          userAgent,
        },
      });
      await recordAudit(tx, {
        contractId: version.contract.id,
        versionId,
        actorUserId: user.id,
        action: "SIGNED",
        payload: { role: signatory.role, signatoryId: signatory.id },
      });
      newlySigned.push({ id: signatory.id, role: signatory.role });
    }

    // After this batch, recheck ratification. We re-query inside the txn so
    // we see the rows we just inserted.
    const allSigs = await tx.contractSignature.count({ where: { versionId } });
    const required = await tx.contractSignatory.count({
      where: { versionId, requiredForRatification: true },
    });
    if (allSigs >= required) {
      await tx.contractVersion.update({
        where: { id: versionId },
        data: { ratifiedAt: new Date() },
      });
      await tx.packContract.update({
        where: { id: version.contract.id },
        data: { status: "RATIFIED", updatedAt: new Date() },
      });
      await recordAudit(tx, {
        contractId: version.contract.id,
        versionId,
        actorUserId: user.id,
        action: "RATIFIED",
        payload: { versionNumber: version.versionNumber },
      });

      // Sync the appointed Dragon Rider on the pack's DragonRegistration so
      // tournament eligibility reflects the ratified contract immediately.
      if (version.dragonRiderUserId) {
        const reg = await tx.dragonRegistration.findUnique({
          where: { ownerType_packOwnerId: { ownerType: "PACK", packOwnerId: packId } },
        });
        if (reg) {
          await tx.dragonRegistration.update({
            where: { id: reg.id },
            data: { dragonRiderUserId: version.dragonRiderUserId },
          });
        }
      }
    }
  });

  return NextResponse.json({
    data: { signedCount: newlySigned.length, signatories: newlySigned },
  });
}
