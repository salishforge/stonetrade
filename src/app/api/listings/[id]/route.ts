import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { updateListingSchema } from "@/lib/validators/listing";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const listing = await prisma.listing.findUnique({
    where: { id },
    include: {
      card: {
        include: {
          game: { select: { name: true, slug: true } },
          set: { select: { name: true, code: true } },
          marketValue: { select: { marketMid: true, confidence: true } },
        },
      },
      seller: { select: { id: true, username: true, sellerRating: true, totalSales: true, country: true } },
      offers: {
        where: { status: "PENDING" },
        select: { id: true, amount: true, createdAt: true },
        orderBy: { amount: "desc" },
        take: 5,
      },
    },
  });

  if (!listing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  return NextResponse.json({ data: listing });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await requireUser();
  const body = await request.json();
  const parsed = updateListingSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.issues }, { status: 400 });
  }

  const listing = await prisma.listing.findUnique({ where: { id } });
  if (!listing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }
  if (listing.sellerId !== user.id) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const updated = await prisma.listing.update({
    where: { id },
    data: parsed.data,
  });

  return NextResponse.json({ data: updated });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await requireUser();

  const listing = await prisma.listing.findUnique({ where: { id } });
  if (!listing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }
  if (listing.sellerId !== user.id) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  await prisma.listing.update({
    where: { id },
    data: { status: "CANCELLED" },
  });

  return NextResponse.json({ data: { success: true } });
}
