import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/auth";
import { evaluateAlerts } from "@/lib/alerts/evaluate";

export async function POST() {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Admin required" }, { status: 403 });

  const result = await evaluateAlerts();
  return NextResponse.json({ data: result });
}
