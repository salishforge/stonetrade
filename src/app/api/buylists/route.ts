import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

export async function GET() {
  const user = await requireUser();

  const buylists = await prisma.buylist.findMany({
    where: { userId: user.id },
    include: { _count: { select: { entries: true } } },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ data: buylists });
}

export async function POST(request: NextRequest) {
  const user = await requireUser();
  const body = await request.json();

  const buylist = await prisma.buylist.create({
    data: {
      userId: user.id,
      name: (body as Record<string, unknown>).name as string ?? "My Buylist",
      isPublic: true,
    },
  });

  return NextResponse.json({ data: buylist }, { status: 201 });
}
