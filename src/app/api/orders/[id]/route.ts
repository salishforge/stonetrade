import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return NextResponse.json({ error: `Order ${id} not found` }, { status: 404 });
}

export async function PATCH() {
  return NextResponse.json({ error: "Not implemented" }, { status: 501 });
}
