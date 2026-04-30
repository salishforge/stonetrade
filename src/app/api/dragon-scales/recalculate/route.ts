import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { recalculateForUserAndPacks } from "@/lib/dragon/recalculate";

// Force a full recompute of the current user's Dragon and any pack Dragons
// they contribute to. Useful after catalog-level changes (Card flag
// updates, freshness set list edits) that pointsCached wouldn't otherwise
// pick up.
export async function POST() {
  const user = await requireUser();
  const registration = await recalculateForUserAndPacks(user.id);
  return NextResponse.json({ data: { registration } });
}
