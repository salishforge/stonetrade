import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Per-card detail for the registry. Returns every serialised variant of a
// (setCode, cardNumber) pair (Stonefoil and any OCM treatments) along with
// the public claim list. PUBLIC_NAMED claims expose the owner's username;
// PUBLIC_ANONYMOUS claims show a stable opaque label without leaking the id.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ setCode: string; cardNumber: string }> },
) {
  const { setCode, cardNumber } = await params;

  // Card.cardNumber is stored with the "/401" suffix for the synthetic seed;
  // platform-synced rows may use the same shape. The URL receives the bare
  // number; match either form.
  const variants = await prisma.card.findMany({
    where: {
      isSerialized: true,
      OR: [{ cardNumber }, { cardNumber: { startsWith: `${cardNumber}/` } }],
      set: { code: setCode },
    },
    include: {
      set: { select: { code: true, name: true } },
    },
    orderBy: { treatment: "asc" },
  });
  if (variants.length === 0) {
    return NextResponse.json({ error: "Card not found in registry" }, { status: 404 });
  }

  const cardIds = variants.map((v) => v.id);
  const claims = await prisma.dragonScale.findMany({
    where: {
      cardId: { in: cardIds },
      visibility: { not: "PRIVATE" },
    },
    select: {
      id: true,
      cardId: true,
      treatment: true,
      serialNumber: true,
      visibility: true,
      createdAt: true,
      user: { select: { username: true, displayName: true } },
    },
    orderBy: [{ treatment: "asc" }, { serialNumber: "asc" }, { createdAt: "asc" }],
  });

  // Anonymise: don't leak the owner identity even by id when the claim is
  // anonymous. Keep claim id stable (used as React key on the client).
  const publicClaims = claims.map((c) => ({
    id: c.id,
    cardId: c.cardId,
    treatment: c.treatment,
    serialNumber: c.serialNumber,
    visibility: c.visibility,
    createdAt: c.createdAt,
    owner:
      c.visibility === "PUBLIC_NAMED"
        ? { username: c.user.username, displayName: c.user.displayName }
        : null,
  }));

  return NextResponse.json({
    data: {
      card: {
        cardNumber: variants[0].cardNumber,
        name: variants[0].name,
        rarity: variants[0].rarity,
        setCode: variants[0].set.code,
        setName: variants[0].set.name,
      },
      variants: variants.map((v) => ({
        cardId: v.id,
        treatment: v.treatment,
        serialTotal: v.serialTotal,
        imageUrl: v.imageUrl,
      })),
      publicClaims,
    },
  });
}
