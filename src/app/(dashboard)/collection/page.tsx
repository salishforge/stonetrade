import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Link from "next/link";

export default async function CollectionPage() {
  const user = await getCurrentUser();
  if (!user) return <p>Please sign in.</p>;

  // Get or create default collection
  let collection = await prisma.collection.findFirst({
    where: { userId: user.id },
  });

  if (!collection) {
    collection = await prisma.collection.create({
      data: { userId: user.id, name: "My Collection" },
    });
  }

  const cards = await prisma.collectionCard.findMany({
    where: { collectionId: collection.id },
    include: {
      card: {
        include: {
          game: { select: { name: true, slug: true } },
          set: { select: { name: true, code: true } },
          marketValue: { select: { marketMid: true, confidence: true } },
        },
      },
    },
    orderBy: { card: { cardNumber: "asc" } },
  });

  // Calculate stats
  let totalValue = 0;
  let totalCost = 0;
  let uniqueCards = 0;
  let totalCards = 0;
  const setCompletion: Record<string, { have: number; total: number; name: string }> = {};

  for (const cc of cards) {
    uniqueCards++;
    totalCards += cc.quantity;
    if (cc.card.marketValue?.marketMid) {
      totalValue += Number(cc.card.marketValue.marketMid) * cc.quantity;
    }
    if (cc.acquiredPrice) {
      totalCost += Number(cc.acquiredPrice) * cc.quantity;
    }
    const setKey = cc.card.set.code;
    if (!setCompletion[setKey]) {
      setCompletion[setKey] = { have: 0, total: 0, name: cc.card.set.name };
    }
    setCompletion[setKey].have++;
  }

  // Get set totals
  const sets = await prisma.set.findMany({
    select: { code: true, totalCards: true, name: true },
  });
  for (const s of sets) {
    if (setCompletion[s.code]) {
      setCompletion[s.code].total = s.totalCards;
    }
  }

  const gainLoss = totalValue - totalCost;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">My Collection</h1>
        <a
          href={`/api/collections/${collection.id}/export`}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          Export CSV
        </a>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Total Value</p>
            <p className="text-2xl font-bold">${totalValue.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Total Cost</p>
            <p className="text-2xl font-bold">${totalCost.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Gain/Loss</p>
            <p className={cn("text-2xl font-bold", gainLoss >= 0 ? "text-green-600" : "text-red-600")}>
              {gainLoss >= 0 ? "+" : ""}${gainLoss.toFixed(2)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Cards</p>
            <p className="text-2xl font-bold">{totalCards}</p>
            <p className="text-xs text-muted-foreground">{uniqueCards} unique</p>
          </CardContent>
        </Card>
      </div>

      {/* Set Completion */}
      {Object.keys(setCompletion).length > 0 && (
        <Card className="mb-8">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Set Completion</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(setCompletion).map(([code, data]) => {
              const pct = data.total > 0 ? Math.round((data.have / data.total) * 100) : 0;
              return (
                <div key={code}>
                  <div className="flex justify-between text-sm mb-1">
                    <span>{data.name}</span>
                    <span className="text-muted-foreground">{data.have}/{data.total} ({pct}%)</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Card List */}
      {cards.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-muted-foreground mb-4">Your collection is empty.</p>
          <Link href="/browse" className={cn(buttonVariants())}>
            Browse Cards to Add
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
                <th className="text-right px-4 py-2 font-medium">Qty</th>
                <th className="text-right px-4 py-2 font-medium">Cost</th>
                <th className="text-right px-4 py-2 font-medium">Value</th>
              </tr>
            </thead>
            <tbody>
              {cards.map((cc) => (
                <tr key={cc.id} className="border-t hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <Link href={`/card/${cc.card.id}`} className="hover:underline font-medium">
                      {cc.card.name}
                    </Link>
                    <span className="text-xs text-muted-foreground ml-2">{cc.card.cardNumber}</span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className="text-xs">{cc.treatment}</Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {cc.condition.replace("_", " ")}
                  </td>
                  <td className="px-4 py-3 text-right">{cc.quantity}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {cc.acquiredPrice ? `$${Number(cc.acquiredPrice).toFixed(2)}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    {cc.card.marketValue?.marketMid
                      ? `$${(Number(cc.card.marketValue.marketMid) * cc.quantity).toFixed(2)}`
                      : "—"}
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
