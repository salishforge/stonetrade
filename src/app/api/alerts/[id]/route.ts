import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await requireUser();

  const alert = await prisma.userAlert.findUnique({ where: { id } });
  if (!alert || alert.userId !== user.id) {
    return NextResponse.json({ error: "Alert not found" }, { status: 404 });
  }

  await prisma.userAlert.delete({ where: { id } });
  return NextResponse.json({ data: { success: true } });
}
