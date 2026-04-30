import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { DRAGON_POINT_THRESHOLD } from "@/lib/dragon/constants";

// Phase 1: returns the user's personal Dragon (if any) plus the threshold so
// the UI can render progress without duplicating the constant. Phase 2 will
// also include any pack Dragons the user contributes to.
export async function GET() {
  const user = await requireUser();

  const personal = await prisma.dragonRegistration.findUnique({
    where: { ownerType_userOwnerId: { ownerType: "USER", userOwnerId: user.id } },
  });

  return NextResponse.json({
    data: {
      personal,
      threshold: DRAGON_POINT_THRESHOLD,
    },
  });
}
