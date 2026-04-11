import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ data: [], total: 0 });
}
