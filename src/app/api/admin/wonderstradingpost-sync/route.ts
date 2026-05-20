import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { syncWonderstradingpost } from "@/lib/wonderstradingpost/sync";
import { isWonderstradingpostConfigured } from "@/lib/wonderstradingpost/client";
import { getAdminUser, isCronAuthorized } from "@/lib/auth";

// Pin Node — the sync runs Prisma queries and an outbound fetch, neither of
// which the edge runtime guarantees.
export const runtime = "nodejs";
// 5-minute upper bound on cron invocations. WTP's listings table has a few
// hundred rows total today; a full refetch finishes in a handful of seconds.
export const maxDuration = 300;

const bodySchema = z
  .object({
    /** ISO timestamp — only ingest listings updated at or after this time. */
    since: z.string().datetime().optional(),
  })
  .strict()
  .optional();

async function authorize(request: NextRequest): Promise<NextResponse | null> {
  if (isCronAuthorized(request)) return null;
  const admin = await getAdminUser();
  if (admin) return null;
  return NextResponse.json({ error: "Admin or CRON_TOKEN required" }, { status: 403 });
}

export async function GET(request: NextRequest) {
  const denied = await authorize(request);
  if (denied) return denied;

  return NextResponse.json({ data: { configured: isWonderstradingpostConfigured() } });
}

export async function POST(request: NextRequest) {
  const denied = await authorize(request);
  if (denied) return denied;

  // Body is optional — GET-style cron invocations from Vercel Cron may send
  // an empty payload. Only parse + validate if there's a real body.
  let since: Date | undefined;
  const text = await request.text();
  if (text.trim().length > 0) {
    let parsed;
    try {
      parsed = bodySchema.parse(JSON.parse(text));
    } catch (err) {
      return NextResponse.json(
        {
          error: "Invalid body",
          details: err instanceof Error ? err.message : String(err),
        },
        { status: 400 },
      );
    }
    if (parsed?.since) since = new Date(parsed.since);
  }

  const result = await syncWonderstradingpost({ since });
  return NextResponse.json({ data: result });
}
