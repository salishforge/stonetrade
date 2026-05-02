import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const collection = await prisma.collection.findUnique({
    where: { id },
    include: {
      cards: {
        include: {
          card: {
            include: {
              game: { select: { name: true } },
              set: { select: { name: true } },
              marketValue: { select: { marketMid: true } },
            },
          },
        },
      },
    },
  });

  if (!collection) {
    return NextResponse.json({ error: "Collection not found" }, { status: 404 });
  }

  // Authorisation: a collection's CSV exposes acquisition prices and notes
  // — that's portfolio data the owner has not chosen to make public unless
  // isPublic is set. Allow either:
  //   (a) the authenticated owner, or
  //   (b) any caller when isPublic = true.
  // Anything else gets a 404 (deliberately, to avoid leaking which IDs exist).
  if (!collection.isPublic) {
    const user = await getCurrentUser();
    if (!user || user.id !== collection.userId) {
      return NextResponse.json({ error: "Collection not found" }, { status: 404 });
    }
  }

  const header = "Game,Set,Card Number,Name,Treatment,Condition,Quantity,Acquired Price,Market Value,Acquired From,Notes\n";
  const rows = collection.cards.map((cc) => {
    const mv = cc.card.marketValue?.marketMid ? Number(cc.card.marketValue.marketMid).toFixed(2) : "";
    const ap = cc.acquiredPrice ? Number(cc.acquiredPrice).toFixed(2) : "";
    return [
      cc.card.game.name,
      cc.card.set.name,
      cc.card.cardNumber,
      `"${cc.card.name}"`,
      cc.treatment,
      cc.condition,
      cc.quantity,
      ap,
      mv,
      cc.acquiredFrom ?? "",
      cc.notes ?? "",
    ].join(",");
  });

  const csv = header + rows.join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${collection.name.replace(/[^a-zA-Z0-9]/g, "_")}.csv"`,
    },
  });
}
