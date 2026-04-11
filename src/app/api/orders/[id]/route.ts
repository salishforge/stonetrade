import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { updateOrderSchema } from "@/lib/validators/order";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await requireUser();

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      listing: {
        include: {
          card: { include: { game: { select: { name: true } }, set: { select: { name: true } } } },
        },
      },
      buyer: { select: { username: true, email: true } },
      seller: { select: { username: true, email: true } },
    },
  });

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  if (order.buyerId !== user.id && order.sellerId !== user.id) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  return NextResponse.json({ data: order });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await requireUser();
  const body = await request.json();
  const parsed = updateOrderSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.issues }, { status: 400 });
  }

  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  // Sellers can mark as shipped, buyers can mark as delivered/completed
  const isSeller = order.sellerId === user.id;
  const isBuyer = order.buyerId === user.id;

  if (!isSeller && !isBuyer) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const updateData: Record<string, unknown> = {};

  if (parsed.data.status === "SHIPPED" && isSeller && order.status === "PAID") {
    updateData.status = "SHIPPED";
    updateData.shippedAt = new Date();
    if (parsed.data.trackingNumber) {
      updateData.trackingNumber = parsed.data.trackingNumber;
    }
  } else if (parsed.data.status === "DELIVERED" && isBuyer && order.status === "SHIPPED") {
    updateData.status = "DELIVERED";
    updateData.deliveredAt = new Date();
  } else if (parsed.data.status === "COMPLETED" && isBuyer && order.status === "DELIVERED") {
    updateData.status = "COMPLETED";
    updateData.completedAt = new Date();
  } else {
    return NextResponse.json({ error: "Invalid status transition" }, { status: 400 });
  }

  const updated = await prisma.order.update({
    where: { id },
    data: updateData,
  });

  return NextResponse.json({ data: updated });
}
