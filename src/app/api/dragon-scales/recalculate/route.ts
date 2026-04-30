import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { recalculateUserDragon } from "@/lib/dragon/recalculate";

// Force a full recompute of the current user's Dragon. Useful after
// catalog-level changes (Card flag updates, freshness set list edits) that
// pointsCached on existing scale rows wouldn't otherwise pick up.
export async function POST() {
  const user = await requireUser();
  const registration = await recalculateUserDragon(user.id);
  return NextResponse.json({ data: { registration } });
}
