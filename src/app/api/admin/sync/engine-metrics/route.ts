import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { getAdminUser } from "@/lib/auth";
import { syncEngineMetrics } from "@/lib/platform/sync-engine-metrics";

const bodySchema = z.object({
  format: z.string().min(1).optional(),
});

export async function POST(request: NextRequest) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Admin required" }, { status: 403 });

  const raw = (await request.json().catch(() => ({}))) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.issues }, { status: 400 });
  }

  const result = await syncEngineMetrics({ format: parsed.data.format });
  return NextResponse.json({ data: result });
}
