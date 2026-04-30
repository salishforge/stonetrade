import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { createPackSchema } from "@/lib/validators/pack";

// GET: packs the current user is a member of (current — leftAt = null).
export async function GET() {
  const user = await requireUser();

  const memberships = await prisma.huntingPackMember.findMany({
    where: { userId: user.id, leftAt: null },
    include: {
      pack: {
        include: {
          _count: { select: { members: { where: { leftAt: null } } } },
          registrations: {
            where: { ownerType: "PACK", dissolvedAt: null },
            select: { id: true, currentPoints: true, formedAt: true },
          },
        },
      },
    },
    orderBy: { joinedAt: "desc" },
  });

  return NextResponse.json({ data: memberships });
}

// POST: create a new pack. The creator becomes the founder + first member.
export async function POST(request: NextRequest) {
  const user = await requireUser();
  const body = await request.json();
  const parsed = createPackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const { name, slug } = parsed.data;

  // Slug uniqueness is enforced by the DB; we still pre-check for a clean
  // 400 instead of a P2002 leak.
  const existing = await prisma.huntingPack.findUnique({ where: { slug } });
  if (existing) {
    return NextResponse.json({ error: "Slug already taken" }, { status: 409 });
  }

  const pack = await prisma.$transaction(async (tx) => {
    const created = await tx.huntingPack.create({
      data: {
        name,
        slug,
        founderId: user.id,
        members: {
          create: { userId: user.id, role: "FOUNDER" },
        },
      },
      include: { members: true },
    });
    return created;
  });

  return NextResponse.json({ data: pack }, { status: 201 });
}
