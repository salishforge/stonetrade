import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

export async function GET() {
  const user = await requireUser();

  const collections = await prisma.collection.findMany({
    where: { userId: user.id },
    include: {
      _count: { select: { cards: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ data: collections });
}

export async function POST(request: NextRequest) {
  const user = await requireUser();
  const body = await request.json();

  const collection = await prisma.collection.create({
    data: {
      userId: user.id,
      name: body.name ?? "My Collection",
      isPublic: body.isPublic ?? false,
    },
  });

  return NextResponse.json({ data: collection }, { status: 201 });
}
