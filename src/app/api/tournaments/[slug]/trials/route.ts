import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminUser } from "@/lib/auth";
import { computeTrials, persistTrials } from "@/lib/tournament/trials";

// Admin: recompute the Hunting Trials side-category awards (Top Dragon,
// Top 10, Osprey per set) for an event. Idempotent — wipes any prior
// TrialAward rows for the event before persisting fresh ones.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  const { slug } = await params;

  const event = await prisma.tournamentEvent.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const result = await computeTrials(event.id);
  await persistTrials(event.id, result);

  return NextResponse.json({
    data: {
      topDragon: result.topDragon,
      top10Count: result.top10.length,
      ospreySetsCount: result.osprey.length,
    },
  });
}

// Public read: every TrialAward for the event with rider + dragon labels
// hydrated for display.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const event = await prisma.tournamentEvent.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const awards = await prisma.trialAward.findMany({
    where: { eventId: event.id },
    include: {
      registration: {
        include: {
          dragon: {
            include: {
              userOwner: { select: { username: true, displayName: true } },
              packOwner: { select: { name: true, slug: true } },
            },
          },
          rider: { select: { username: true, displayName: true } },
        },
      },
    },
    orderBy: [{ kind: "asc" }, { setCode: "asc" }, { rank: "asc" }],
  });

  return NextResponse.json({ data: awards });
}
