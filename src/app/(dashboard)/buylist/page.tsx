import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Link from "next/link";

export default async function BuylistPage() {
  const user = await getCurrentUser();
  if (!user) return <p>Please sign in.</p>;

  // Get or create default buylist
  let buylist = await prisma.buylist.findFirst({
    where: { userId: user.id },
  });

  if (!buylist) {
    buylist = await prisma.buylist.create({
      data: { userId: user.id, name: "My Buylist" },
    });
  }

  const entries = await prisma.buylistEntry.findMany({
    where: { buylistId: buylist.id },
    include: {
      card: {
        select: { id: true, name: true, cardNumber: true, orbital: true, rarity: true, marketValue: { select: { marketMid: true } } },
      },
    },
    orderBy: { card: { name: "asc" } },
  });

  const totalBudget = entries.reduce((sum, e) => sum + Number(e.maxPrice) * e.quantity, 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">My Buylist</h1>
        <span className="text-sm text-muted-foreground">
          Total budget: ${totalBudget.toFixed(2)}
        </span>
      </div>

      {entries.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-muted-foreground mb-4">
            Your buylist is empty. Add cards you want to buy and set your max price.
          </p>
          <Link href="/browse" className={cn(buttonVariants())}>
            Browse Cards
          </Link>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Card</th>
                <th className="text-left px-4 py-2 font-medium">Treatment</th>
                <th className="text-left px-4 py-2 font-medium">Condition</th>
                <th className="text-right px-4 py-2 font-medium">Max Price</th>
                <th className="text-right px-4 py-2 font-medium">Market</th>
                <th className="text-right px-4 py-2 font-medium">Qty</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const market = entry.card.marketValue?.marketMid;
                const diff = market ? Number(entry.maxPrice) - Number(market) : null;
                return (
                  <tr key={entry.id} className="border-t hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <Link href={`/card/${entry.card.id}`} className="hover:underline font-medium">
                        {entry.card.name}
                      </Link>
                      <span className="text-xs text-muted-foreground ml-2">{entry.card.cardNumber}</span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="text-xs">{entry.treatment}</Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {entry.condition.replace("_", " ")}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      ${Number(entry.maxPrice).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {market ? (
                        <span className={cn("text-xs", diff && diff > 0 ? "text-green-600" : diff && diff < 0 ? "text-red-600" : "")}>
                          ${Number(market).toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">{entry.quantity}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
