import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminUser, requireUser } from "@/lib/auth";
import { createTournamentSchema } from "@/lib/validators/tournament";

export async function GET() {
  await requireUser();
  const events = await prisma.tournamentEvent.findMany({
    orderBy: { eventDate: "desc" },
    include: {
      _count: { select: { registrations: true } },
    },
  });
  return NextResponse.json({ data: events });
}

export async function POST(request: NextRequest) {
  const admin = await getAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = createTournamentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const existing = await prisma.tournamentEvent.findUnique({
    where: { slug: parsed.data.slug },
  });
  if (existing) {
    return NextResponse.json({ error: "Slug already taken" }, { status: 409 });
  }

  const created = await prisma.tournamentEvent.create({
    data: {
      name: parsed.data.name,
      slug: parsed.data.slug,
      description: parsed.data.description ?? null,
      eventDate: new Date(parsed.data.eventDate),
      basePrizePool: parsed.data.basePrizePool,
      dragonGoldPool: parsed.data.dragonGoldPool,
      status: parsed.data.status,
    },
  });
  return NextResponse.json({ data: created }, { status: 201 });
}
