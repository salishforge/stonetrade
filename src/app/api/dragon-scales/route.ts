import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { createDragonScaleSchema } from "@/lib/validators/dragon";
import { recalculateForUserAndPacks } from "@/lib/dragon/recalculate";
import { isScoringTreatment } from "@/lib/dragon/constants";
import { OCM_SERIAL_LIMITS } from "@/types/platform";

// Parse a serial like "5/10" or "5" into { numerator, denominator? }. Returns
// null when the string doesn't look like a serial. Lenient on whitespace +
// leading zeroes; strict on negative or non-integer values.
function parseSerialNumber(s: string): { numerator: number; denominator?: number } | null {
  const m = s.trim().match(/^(\d+)(?:\s*\/\s*(\d+))?$/);
  if (!m) return null;
  const numerator = parseInt(m[1], 10);
  if (!Number.isFinite(numerator) || numerator <= 0) return null;
  const denom = m[2] ? parseInt(m[2], 10) : undefined;
  return { numerator, denominator: denom };
}

export async function GET() {
  const user = await requireUser();

  const scales = await prisma.dragonScale.findMany({
    where: { userId: user.id },
    include: {
      card: {
        select: {
          id: true,
          name: true,
          cardNumber: true,
          rarity: true,
          treatment: true,
          imageUrl: true,
          isStoneseeker: true,
          isLoreMythic: true,
          isToken: true,
          set: { select: { code: true, name: true } },
        },
      },
    },
    orderBy: [{ pointsCached: "desc" }, { createdAt: "desc" }],
  });

  const totalPoints = scales.reduce((sum, s) => sum + s.pointsCached, 0);

  return NextResponse.json({ data: scales, totalPoints });
}

export async function POST(request: NextRequest) {
  const user = await requireUser();
  const body = await request.json();
  const parsed = createDragonScaleSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const input = parsed.data;

  const card = await prisma.card.findUnique({
    where: { id: input.cardId },
    select: {
      id: true,
      treatment: true,
      rarity: true,
      isToken: true,
      isSerialized: true,
      serialTotal: true,
    },
  });
  if (!card) {
    return NextResponse.json({ error: "Card not found" }, { status: 404 });
  }

  // Tokens are scored regardless of treatment via the token table; non-token
  // cards must be in a scoring treatment (excludes Classic Paper).
  if (!card.isToken && !isScoringTreatment(card.treatment)) {
    return NextResponse.json(
      { error: `Treatment "${card.treatment}" is not eligible for Dragon Scales` },
      { status: 400 },
    );
  }

  // Stonefoil cards are 1/1 — exactly one copy of each exists in the world.
  // Reject quantity > 1, and pre-check that no other DragonScale row already
  // claims this Card so we can return a clean 409 instead of leaking the
  // partial-unique-index P2002 error from Prisma.
  if (card.treatment === "Stonefoil") {
    if (input.quantity > 1) {
      return NextResponse.json(
        { error: "Stonefoil cards are 1/1 — quantity must be 1" },
        { status: 400 },
      );
    }
    const existing = await prisma.dragonScale.findFirst({
      where: { cardId: card.id, treatment: "Stonefoil" },
      select: { id: true, userId: true },
    });
    if (existing) {
      return NextResponse.json(
        { error: "This Stonefoil is already claimed as a Dragon Scale" },
        { status: 409 },
      );
    }
  }

  // OCM cards are serialised at per-rarity print runs. The serial number
  // identifies the specific physical card; we require it on creation so
  // the registry can show "5/10" slot-by-slot, and reject claims that
  // collide with an existing serial. The serial is canonicalised to
  // "{n}/{cap}" before persistence so "5", "5/10", and "05/10" all collapse
  // to the same key — without this, the per-serial unique index could be
  // bypassed by typing variation.
  let ocmCanonicalSerial: string | null = null;
  if (card.treatment === "OCM") {
    if (input.quantity > 1) {
      return NextResponse.json(
        { error: "OCM serial numbers identify a single card — quantity must be 1" },
        { status: 400 },
      );
    }
    if (!input.serialNumber) {
      return NextResponse.json(
        { error: "OCM scales require a serial number (e.g. '5/10')" },
        { status: 400 },
      );
    }
    // Print-run cap: prefer the per-card serialTotal when populated, fall
    // back to the rarity-based limit map. A handful of platform-synced OCM
    // rows have serialTotal=null even though their rarity is a known one;
    // without the fallback the bounds check would silently pass.
    const cap = card.serialTotal ?? OCM_SERIAL_LIMITS[card.rarity] ?? null;
    const parsed = parseSerialNumber(input.serialNumber);
    if (!parsed) {
      return NextResponse.json(
        { error: `Couldn't parse serial number "${input.serialNumber}"` },
        { status: 400 },
      );
    }
    if (cap != null && (parsed.numerator < 1 || parsed.numerator > cap)) {
      return NextResponse.json(
        {
          error: `Serial must be in 1..${cap} for this OCM (got "${input.serialNumber}")`,
        },
        { status: 400 },
      );
    }
    ocmCanonicalSerial = cap != null ? `${parsed.numerator}/${cap}` : `${parsed.numerator}`;
    const existing = await prisma.dragonScale.findFirst({
      where: { cardId: card.id, treatment: "OCM", serialNumber: ocmCanonicalSerial },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        { error: `OCM serial ${ocmCanonicalSerial} of this card is already claimed` },
        { status: 409 },
      );
    }
  }

  // Tokens cannot carry bonus variants per PDF — silently coerce to NONE so a
  // forgotten variant in the picker doesn't reject the row.
  const bonusVariant = card.isToken ? "NONE" : input.bonusVariant;

  // Optional CollectionCard link must belong to the same user, otherwise the
  // user could quietly attach someone else's collection record to their scale.
  if (input.collectionCardId) {
    const cc = await prisma.collectionCard.findUnique({
      where: { id: input.collectionCardId },
      include: { collection: { select: { userId: true } } },
    });
    if (!cc || cc.collection.userId !== user.id) {
      return NextResponse.json({ error: "Collection card not found" }, { status: 404 });
    }
  }

  const scale = await prisma.dragonScale.create({
    data: {
      userId: user.id,
      cardId: card.id,
      treatment: card.treatment,
      bonusVariant,
      quantity: input.quantity,
      // Stonefoil 1/1 doesn't need a serial; OCM uses the canonical form
      // built above so the per-serial unique index isn't bypassed by typing
      // variants. Other treatments pass the raw user input through.
      serialNumber:
        card.treatment === "Stonefoil"
          ? null
          : card.treatment === "OCM"
          ? ocmCanonicalSerial
          : input.serialNumber ?? null,
      collectionCardId: input.collectionCardId ?? null,
      notes: input.notes ?? null,
      visibility: input.visibility,
    },
  });

  await recalculateForUserAndPacks(user.id);

  // Re-fetch with the include shape the GET uses, so the client gets a
  // consistent response and the freshly computed pointsCached.
  const fresh = await prisma.dragonScale.findUniqueOrThrow({
    where: { id: scale.id },
    include: {
      card: {
        select: {
          id: true,
          name: true,
          cardNumber: true,
          rarity: true,
          treatment: true,
          imageUrl: true,
          isStoneseeker: true,
          isLoreMythic: true,
          isToken: true,
          set: { select: { code: true, name: true } },
        },
      },
    },
  });

  return NextResponse.json({ data: fresh }, { status: 201 });
}
