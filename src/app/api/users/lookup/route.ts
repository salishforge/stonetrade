import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

// Username → minimal User payload. Authenticated only — public username
// enumeration would help scrape the marketplace.
export async function GET(request: NextRequest) {
  await requireUser();

  const username = request.nextUrl.searchParams.get("username");
  if (!username) {
    return NextResponse.json({ error: "username required" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { username },
    select: { id: true, username: true, displayName: true },
  });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  return NextResponse.json({ data: user });
}
