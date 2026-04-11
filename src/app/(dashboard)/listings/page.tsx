import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Link from "next/link";

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-800",
  SOLD: "bg-blue-100 text-blue-800",
  RESERVED: "bg-yellow-100 text-yellow-800",
  EXPIRED: "bg-gray-100 text-gray-800",
  CANCELLED: "bg-red-100 text-red-800",
};

export default async function MyListingsPage() {
  const user = await getCurrentUser();
  if (!user) return <p>Please sign in.</p>;

  const listings = await prisma.listing.findMany({
    where: { sellerId: user.id },
    include: {
      card: { select: { name: true, cardNumber: true, rarity: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">My Listings</h1>
        <Link href="/create-listing" className={cn(buttonVariants({ size: "sm" }))}>
          New Listing
        </Link>
      </div>

      {listings.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-muted-foreground mb-4">You don&apos;t have any listings yet.</p>
          <Link href="/create-listing" className={cn(buttonVariants())}>
            Create Your First Listing
          </Link>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Card</th>
                <th className="text-left px-4 py-2 font-medium">Price</th>
                <th className="text-left px-4 py-2 font-medium">Qty</th>
                <th className="text-left px-4 py-2 font-medium">Status</th>
                <th className="text-left px-4 py-2 font-medium">Listed</th>
              </tr>
            </thead>
            <tbody>
              {listings.map((listing) => (
                <tr key={listing.id} className="border-t hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <Link href={`/listing/${listing.id}`} className="hover:underline">
                      <span className="font-medium">{listing.card?.name ?? "Unknown"}</span>
                      <span className="text-muted-foreground ml-2 text-xs">
                        {listing.treatment} &middot; {listing.condition?.replace("_", " ")}
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-medium">${Number(listing.price).toFixed(2)}</td>
                  <td className="px-4 py-3">{listing.quantity - listing.quantitySold}</td>
                  <td className="px-4 py-3">
                    <Badge className={STATUS_COLORS[listing.status] ?? ""} variant="secondary">
                      {listing.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(listing.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
