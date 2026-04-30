import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminUser, requireUser } from "@/lib/auth";
import { updateTournamentSchema } from "@/lib/validators/tournament";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  await requireUser();
  const { slug } = await params;
  const event = await prisma.tournamentEvent.findUnique({
    where: { slug },
    include: {
      registrations: {
        include: {
          dragon: {
            include: {
              userOwner: { select: { id: true, username: true, displayName: true } },
              packOwner: { select: { id: true, name: true, slug: true } },
            },
          },
          rider: { select: { id: true, username: true, displayName: true } },
          result: true,
        },
        orderBy: [{ result: { finishingPosition: "asc" } }, { createdAt: "asc" }],
      },
    },
  });
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });
  return NextResponse.json({ data: event });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  const { slug } = await params;
  const body = await request.json();
  const parsed = updateTournamentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }
  const updated = await prisma.tournamentEvent.update({
    where: { slug },
    data: {
      name: parsed.data.name ?? undefined,
      description: parsed.data.description === undefined ? undefined : parsed.data.description ?? null,
      eventDate: parsed.data.eventDate ? new Date(parsed.data.eventDate) : undefined,
      basePrizePool: parsed.data.basePrizePool ?? undefined,
      dragonGoldPool: parsed.data.dragonGoldPool ?? undefined,
      status: parsed.data.status ?? undefined,
    },
  });
  return NextResponse.json({ data: updated });
}
