import { NextRequest, NextResponse } from "next/server";
import { recalculateCardValue, recalculateAllCardValues } from "@/lib/pricing/recalculate";
import { getAdminUser, isCronAuthorized } from "@/lib/auth";

/**
 * Trigger a price recompute. Two callers:
 *   - cron job (CRON_TOKEN bearer)
 *   - admin user via the admin UI
 *
 * Anonymous callers are rejected. Without this gate, anyone could trigger
 * `recalculateAllCardValues()` and either DoS the worker or grind the
 * database into the dirt with repeated full-table sweeps.
 */
export async function POST(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    const admin = await getAdminUser();
    if (!admin) {
      return NextResponse.json({ error: "Admin or CRON_TOKEN required" }, { status: 403 });
    }
  }

  const body = await request.json().catch(() => ({}));
  const cardId = (body as Record<string, unknown>).cardId as string | undefined;

  if (cardId) {
    const result = await recalculateCardValue(cardId);
    return NextResponse.json({ data: result });
  }

  const result = await recalculateAllCardValues();
  return NextResponse.json({ data: result });
}
