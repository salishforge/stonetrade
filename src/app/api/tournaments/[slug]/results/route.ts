import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminUser } from "@/lib/auth";
import { enterResultsSchema } from "@/lib/validators/tournament";
import { computePayouts } from "@/lib/tournament/payout";

// Admin: enter finishing positions for a completed event. The payout engine
// expands them into base + Dragon Gold payouts and persists one
// TournamentResult per registration. Re-running this endpoint with an
// updated finishing order replaces the result rows wholesale, so a
// disqualification correction can be redone without surgery.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  const { slug } = await params;

  const body = await request.json();
  const parsed = enterResultsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const event = await prisma.tournamentEvent.findUnique({
    where: { slug },
    include: {
      registrations: { select: { id: true, declaredPoints: true } },
    },
  });
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  // Validate every registrationId in the input belongs to this event.
  const eventRegIds = new Set(event.registrations.map((r) => r.id));
  for (const r of parsed.data.results) {
    if (!eventRegIds.has(r.registrationId)) {
      return NextResponse.json(
        { error: `Registration ${r.registrationId} is not part of this event` },
        { status: 400 },
      );
    }
  }

  // Build the input for the engine — declaredPoints from the DB, position
  // from the admin's submission.
  const declaredById = new Map(event.registrations.map((r) => [r.id, r.declaredPoints]));
  const computed = computePayouts(
    parsed.data.results.map((r) => ({
      registrationId: r.registrationId,
      finishingPosition: r.finishingPosition,
      declaredPoints: declaredById.get(r.registrationId) ?? 0,
    })),
    Math.round(Number(event.dragonGoldPool) * 100),
  );

  await prisma.$transaction(async (tx) => {
    // Wipe and replace any existing results so a re-entered batch stays
    // consistent — the alternative (upsert per row) is fragile when the
    // total weighted points changes.
    await tx.tournamentResult.deleteMany({
      where: { registration: { eventId: event.id } },
    });
    for (const c of computed) {
      await tx.tournamentResult.create({
        data: {
          registrationId: c.registrationId,
          finishingPosition: c.finishingPosition,
          multiplier: c.multiplier,
          weightedPoints: c.weightedPoints,
          basePayoutCents: c.basePayoutCents,
          dragonGoldPayoutCents: c.dragonGoldPayoutCents,
        },
      });
      await tx.tournamentRegistration.update({
        where: { id: c.registrationId },
        data: { status: "COMPLETED" },
      });
    }
    await tx.tournamentEvent.update({
      where: { id: event.id },
      data: { status: "COMPLETED" },
    });
  });

  return NextResponse.json({ data: { resultsRecorded: computed.length, computed } });
}
