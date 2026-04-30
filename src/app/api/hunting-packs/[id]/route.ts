import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { updatePackSchema } from "@/lib/validators/pack";

async function loadPackForMember(id: string, userId: string) {
  const pack = await prisma.huntingPack.findUnique({
    where: { id },
    include: {
      members: {
        include: {
          user: { select: { id: true, username: true, displayName: true } },
        },
        orderBy: { joinedAt: "asc" },
      },
      contract: {
        include: {
          currentVersion: {
            include: {
              signatories: {
                include: { signature: true, user: { select: { id: true, username: true, displayName: true } } },
              },
            },
          },
        },
      },
      registrations: {
        where: { ownerType: "PACK" },
        include: { dragonRider: { select: { id: true, username: true, displayName: true } } },
        orderBy: { formedAt: "desc" },
      },
    },
  });
  if (!pack) return { error: "Pack not found" as const };
  const isMember = pack.members.some((m) => m.userId === userId && m.leftAt == null);
  if (!isMember) return { error: "Forbidden" as const };
  return { pack };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  const { id } = await params;
  const r = await loadPackForMember(id, user.id);
  if ("error" in r) {
    return NextResponse.json({ error: r.error }, { status: r.error === "Pack not found" ? 404 : 403 });
  }
  return NextResponse.json({ data: r.pack });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  const { id } = await params;
  const body = await request.json();
  const parsed = updatePackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const pack = await prisma.huntingPack.findUnique({
    where: { id },
    select: { founderId: true },
  });
  if (!pack) return NextResponse.json({ error: "Pack not found" }, { status: 404 });
  // Only the founder can rename. Disbanding is a separate, currently-unbuilt
  // action — out of scope for Phase 2.
  if (pack.founderId !== user.id) {
    return NextResponse.json({ error: "Only the founder may modify the pack" }, { status: 403 });
  }

  const updated = await prisma.huntingPack.update({
    where: { id },
    data: { name: parsed.data.name ?? undefined },
  });
  return NextResponse.json({ data: updated });
}
