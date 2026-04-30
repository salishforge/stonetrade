import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { proposeVersionSchema } from "@/lib/validators/contract";
import { hashBody } from "@/lib/contracts/hash";
import { recordAudit } from "@/lib/contracts/audit";
import { triggerNotification } from "@/lib/notify/novu";
import { canonicalize } from "@/lib/contracts/canonicalize";

// Propose a new contract version. Auto-creates the PackContract if this is
// the first version. Every named signatory (every current pack member +
// the named Dragon Rider, if any) gets a ContractSignatory row; the
// previously-ratified version moves to SUPERSEDED.
//
// The bodyJson is deterministic-canonicalised before hashing. Signatures
// captured later record signedBodyHash equal to the version's bodyHash, so
// a downstream inspection can verify nobody tampered with the body after
// signing.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  const { id: packId } = await params;
  const body = await request.json();
  const parsed = proposeVersionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const pack = await prisma.huntingPack.findUnique({
    where: { id: packId },
    include: {
      members: { where: { leftAt: null } },
      contract: { include: { currentVersion: true } },
    },
  });
  if (!pack) return NextResponse.json({ error: "Pack not found" }, { status: 404 });
  const isMember = pack.members.some((m) => m.userId === user.id);
  if (!isMember) {
    return NextResponse.json({ error: "Only members can propose contract versions" }, { status: 403 });
  }

  const input = parsed.data;

  // Validate manualAllocations references real members.
  if (input.payoutMode === "MANUAL" && input.manualAllocations) {
    const memberIds = new Set(pack.members.map((m) => m.userId));
    for (const a of input.manualAllocations) {
      if (!memberIds.has(a.userId)) {
        return NextResponse.json(
          { error: `Manual allocation references non-member ${a.userId}` },
          { status: 400 },
        );
      }
    }
  }

  // Validate the named rider is a real user.
  if (input.dragonRiderUserId) {
    const exists = await prisma.user.findUnique({
      where: { id: input.dragonRiderUserId },
      select: { id: true },
    });
    if (!exists) {
      return NextResponse.json({ error: "Dragon Rider user not found" }, { status: 400 });
    }
  }

  // The canonical body is what gets hashed and signed. Keep it minimal +
  // explicit so a future format change can be detected by hash mismatch.
  const bodyForHash: Record<string, unknown> = {
    payoutMode: input.payoutMode,
    riderPaymentMode: input.riderPaymentMode,
    riderPaymentValue: input.riderPaymentValue,
    dragonRiderUserId: input.dragonRiderUserId ?? null,
    manualAllocations: input.manualAllocations ?? null,
    members: pack.members.map((m) => m.userId).sort(),
    notes: input.notes ?? null,
  };
  const bodyHash = hashBody(bodyForHash);

  const result = await prisma.$transaction(async (tx) => {
    let contract = pack.contract;
    if (!contract) {
      const newContract = await tx.packContract.create({
        data: { packId, status: "DRAFT" },
      });
      contract = { ...newContract, currentVersion: null };
      await recordAudit(tx, {
        contractId: contract.id,
        actorUserId: user.id,
        action: "CONTRACT_DRAFTED",
      });
    }

    // Mark previous active version superseded.
    if (contract.currentVersion) {
      await tx.contractVersion.update({
        where: { id: contract.currentVersion.id },
        data: {},
      });
      // No status field on version itself — supersession is reflected at
      // the PackContract level by currentVersionId pointing elsewhere.
    }

    const lastVersion = await tx.contractVersion.findFirst({
      where: { contractId: contract.id },
      orderBy: { versionNumber: "desc" },
      select: { versionNumber: true },
    });
    const versionNumber = (lastVersion?.versionNumber ?? 0) + 1;

    const version = await tx.contractVersion.create({
      data: {
        contractId: contract.id,
        versionNumber,
        bodyJson: JSON.parse(canonicalize(bodyForHash)),
        bodyHash,
        payoutMode: input.payoutMode,
        riderPaymentMode: input.riderPaymentMode,
        riderPaymentValue: input.riderPaymentValue,
        dragonRiderUserId: input.dragonRiderUserId ?? null,
        createdByUserId: user.id,
      },
    });

    // Required signatories: every current pack member + the rider (if any
    // and not already a member). A user who is both pack member and rider
    // gets two ContractSignatory rows (different roles) and must sign
    // twice — keeps the audit trail crystal clear about which hat they had on.
    const memberIds = pack.members.map((m) => m.userId);
    const signatoryData: { userId: string; role: "PACK_MEMBER" | "DRAGON_RIDER" }[] = [
      ...memberIds.map((u) => ({ userId: u, role: "PACK_MEMBER" as const })),
    ];
    if (input.dragonRiderUserId) {
      signatoryData.push({ userId: input.dragonRiderUserId, role: "DRAGON_RIDER" });
    }
    await tx.contractSignatory.createMany({
      data: signatoryData.map((s) => ({
        versionId: version.id,
        userId: s.userId,
        role: s.role,
      })),
    });

    // Move the contract pointer + status.
    await tx.packContract.update({
      where: { id: contract.id },
      data: {
        currentVersionId: version.id,
        status: signatoryData.length === 0 ? "RATIFIED" : "PENDING_APPROVAL",
        updatedAt: new Date(),
      },
    });

    await recordAudit(tx, {
      contractId: contract.id,
      versionId: version.id,
      actorUserId: user.id,
      action: "VERSION_PROPOSED",
      payload: { versionNumber, bodyHash },
    });

    return { contract, version, signatoryCount: signatoryData.length };
  });

  // Notify all signatories that signature is required. Best-effort.
  const signatories = await prisma.contractSignatory.findMany({
    where: { versionId: result.version.id },
    include: { user: { select: { id: true, email: true, username: true } } },
  });
  for (const s of signatories) {
    await triggerNotification({
      workflowId: "contract-signature-required",
      to: { id: s.user.id, email: s.user.email, username: s.user.username },
      payload: {
        packName: pack.name,
        packSlug: pack.slug,
        versionNumber: result.version.versionNumber,
        role: s.role,
      },
      transactionId: `${result.version.id}:${s.id}`,
    });
  }

  return NextResponse.json({ data: result.version }, { status: 201 });
}
