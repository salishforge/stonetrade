import { NextRequest, NextResponse } from "next/server";
import { getAdminUser, isCronAuthorized } from "@/lib/auth";
import { evaluateAlerts } from "@/lib/alerts/evaluate";

export async function POST(request: NextRequest) {
  const cronOk = isCronAuthorized(request);
  if (!cronOk) {
    const admin = await getAdminUser();
    if (!admin) return NextResponse.json({ error: "Admin or CRON_TOKEN required" }, { status: 403 });
  }

  const result = await evaluateAlerts();
  return NextResponse.json({ data: result });
}
