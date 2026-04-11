import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import Link from "next/link";

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  ACCEPTED: "bg-green-100 text-green-800",
  DECLINED: "bg-red-100 text-red-800",
  COUNTERED: "bg-blue-100 text-blue-800",
  EXPIRED: "bg-gray-100 text-gray-600",
  WITHDRAWN: "bg-gray-100 text-gray-600",
};

export default async function OffersPage() {
  const user = await getCurrentUser();
  if (!user) return <p>Please sign in.</p>;

  const [incoming, outgoing] = await Promise.all([
    prisma.offer.findMany({
      where: { listing: { sellerId: user.id } },
      include: {
        listing: { include: { card: { select: { name: true, treatment: true } } } },
        buyer: { select: { username: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.offer.findMany({
      where: { buyerId: user.id },
      include: {
        listing: {
          include: {
            card: { select: { name: true, treatment: true } },
            seller: { select: { username: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);

  const pendingCount = incoming.filter((o) => o.status === "PENDING").length;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Offers</h1>
      <Tabs defaultValue="incoming">
        <TabsList>
          <TabsTrigger value="incoming">
            Incoming {pendingCount > 0 && `(${pendingCount})`}
          </TabsTrigger>
          <TabsTrigger value="outgoing">Outgoing ({outgoing.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="incoming" className="mt-4">
          {incoming.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">No incoming offers.</p>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">Card</th>
                    <th className="text-left px-4 py-2 font-medium">From</th>
                    <th className="text-right px-4 py-2 font-medium">Amount</th>
                    <th className="text-left px-4 py-2 font-medium">Status</th>
                    <th className="text-left px-4 py-2 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {incoming.map((offer) => (
                    <tr key={offer.id} className="border-t hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <Link href={`/listing/${offer.listingId}`} className="hover:underline font-medium">
                          {offer.listing.card?.name ?? "Unknown"}
                        </Link>
                        <span className="text-xs text-muted-foreground ml-2">{offer.listing.card?.treatment}</span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{offer.buyer.username}</td>
                      <td className="px-4 py-3 text-right font-medium">${Number(offer.amount).toFixed(2)}</td>
                      <td className="px-4 py-3">
                        <Badge className={STATUS_COLORS[offer.status] ?? ""} variant="secondary">
                          {offer.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(offer.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="outgoing" className="mt-4">
          {outgoing.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">No outgoing offers.</p>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">Card</th>
                    <th className="text-left px-4 py-2 font-medium">Seller</th>
                    <th className="text-right px-4 py-2 font-medium">Amount</th>
                    <th className="text-left px-4 py-2 font-medium">Status</th>
                    <th className="text-left px-4 py-2 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {outgoing.map((offer) => (
                    <tr key={offer.id} className="border-t hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <Link href={`/listing/${offer.listingId}`} className="hover:underline font-medium">
                          {offer.listing.card?.name ?? "Unknown"}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{offer.listing.seller?.username}</td>
                      <td className="px-4 py-3 text-right font-medium">${Number(offer.amount).toFixed(2)}</td>
                      <td className="px-4 py-3">
                        <Badge className={STATUS_COLORS[offer.status] ?? ""} variant="secondary">
                          {offer.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(offer.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
