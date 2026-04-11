import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import Link from "next/link";

const STATUS_COLORS: Record<string, string> = {
  PENDING_PAYMENT: "bg-yellow-100 text-yellow-800",
  PAID: "bg-blue-100 text-blue-800",
  SHIPPED: "bg-indigo-100 text-indigo-800",
  DELIVERED: "bg-green-100 text-green-800",
  COMPLETED: "bg-green-200 text-green-900",
  DISPUTED: "bg-red-100 text-red-800",
  REFUNDED: "bg-gray-100 text-gray-800",
  CANCELLED: "bg-gray-100 text-gray-600",
};

function OrderTable({ orders }: { orders: Array<Record<string, unknown>> }) {
  if (orders.length === 0) {
    return <p className="text-center py-8 text-muted-foreground">No orders yet.</p>;
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="text-left px-4 py-2 font-medium">Card</th>
            <th className="text-left px-4 py-2 font-medium">Total</th>
            <th className="text-left px-4 py-2 font-medium">Status</th>
            <th className="text-left px-4 py-2 font-medium">Date</th>
            <th className="text-left px-4 py-2 font-medium">With</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => {
            const listing = order.listing as Record<string, unknown> | null;
            const card = listing?.card as Record<string, unknown> | null;
            const buyer = order.buyer as Record<string, unknown> | null;
            const seller = order.seller as Record<string, unknown> | null;
            const status = order.status as string;

            return (
              <tr key={order.id as string} className="border-t hover:bg-muted/30">
                <td className="px-4 py-3">
                  <span className="font-medium">{(card?.name as string) ?? "Unknown"}</span>
                  <span className="text-xs text-muted-foreground ml-2">
                    {listing?.treatment as string}
                  </span>
                </td>
                <td className="px-4 py-3 font-medium">${Number(order.total).toFixed(2)}</td>
                <td className="px-4 py-3">
                  <Badge className={STATUS_COLORS[status] ?? ""} variant="secondary">
                    {status.replace("_", " ")}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {new Date(order.createdAt as string).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {(buyer?.username as string) ?? (seller?.username as string)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default async function OrdersPage() {
  const user = await getCurrentUser();
  if (!user) return <p>Please sign in.</p>;

  const [buyerOrders, sellerOrders] = await Promise.all([
    prisma.order.findMany({
      where: { buyerId: user.id },
      include: {
        listing: { include: { card: { select: { name: true, treatment: true } } } },
        seller: { select: { username: true } },
        buyer: { select: { username: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.order.findMany({
      where: { sellerId: user.id },
      include: {
        listing: { include: { card: { select: { name: true, treatment: true } } } },
        buyer: { select: { username: true } },
        seller: { select: { username: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Orders</h1>
      <Tabs defaultValue="purchases">
        <TabsList>
          <TabsTrigger value="purchases">Purchases ({buyerOrders.length})</TabsTrigger>
          <TabsTrigger value="sales">Sales ({sellerOrders.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="purchases" className="mt-4">
          <OrderTable orders={buyerOrders as unknown as Array<Record<string, unknown>>} />
        </TabsContent>
        <TabsContent value="sales" className="mt-4">
          <OrderTable orders={sellerOrders as unknown as Array<Record<string, unknown>>} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
