import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import Link from "next/link";

export default async function TrendingPage() {
  // Most valuable cards
  const mostValuable = await prisma.cardMarketValue.findMany({
    where: { marketMid: { not: null } },
    include: {
      card: { select: { id: true, name: true, cardNumber: true, orbital: true, rarity: true, treatment: true } },
    },
    orderBy: { marketMid: "desc" },
    take: 20,
  });

  // Most listed (active listing count)
  const mostListed = await prisma.card.findMany({
    where: { listings: { some: { status: "ACTIVE" } } },
    include: {
      _count: { select: { listings: true } },
      marketValue: { select: { marketMid: true } },
    },
    orderBy: { listings: { _count: "desc" } },
    take: 10,
  });

  // Highest confidence
  const highConfidence = await prisma.cardMarketValue.findMany({
    where: { confidence: { gte: 25 } },
    include: {
      card: { select: { id: true, name: true, rarity: true, treatment: true } },
    },
    orderBy: { confidence: "desc" },
    take: 10,
  });

  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-2">Trending</h1>
      <p className="text-muted-foreground mb-8">Market activity and card price trends</p>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Most Valuable */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Most Valuable Cards</CardTitle>
          </CardHeader>
          <CardContent>
            {mostValuable.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No priced cards yet.</p>
            ) : (
              <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
                {mostValuable.map((mv, i) => (
                  <Link
                    key={mv.id}
                    href={`/card/${mv.card.id}`}
                    className="flex items-center gap-3 border rounded-md px-3 py-2 hover:bg-muted/50 transition-colors"
                  >
                    <span className="text-lg font-bold text-muted-foreground w-6 text-right">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{mv.card.name}</p>
                      <p className="text-xs text-muted-foreground">{mv.card.treatment}</p>
                    </div>
                    <span className="text-sm font-bold">${Number(mv.marketMid).toFixed(2)}</span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Most Listed */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Most Listed</CardTitle>
          </CardHeader>
          <CardContent>
            {mostListed.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No active listings.</p>
            ) : (
              <div className="space-y-2">
                {mostListed.map((card) => (
                  <div key={card.id} className="flex items-center justify-between py-1">
                    <Link href={`/card/${card.id}`} className="text-sm hover:underline truncate">
                      {card.name}
                    </Link>
                    <Badge variant="secondary" className="text-xs shrink-0 ml-2">
                      {card._count.listings} listing{card._count.listings !== 1 ? "s" : ""}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Highest Confidence */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Most Reliable Prices</CardTitle>
          </CardHeader>
          <CardContent>
            {highConfidence.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No high-confidence prices yet. Help by reporting sales!
              </p>
            ) : (
              <div className="space-y-2">
                {highConfidence.map((mv) => (
                  <div key={mv.id} className="flex items-center justify-between py-1">
                    <Link href={`/card/${mv.card.id}`} className="text-sm hover:underline truncate">
                      {mv.card.name}
                    </Link>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className="text-sm font-medium">${Number(mv.marketMid).toFixed(2)}</span>
                      <Badge className={cn(
                        "text-[10px]",
                        mv.confidence >= 50 ? "bg-green-100 text-green-800" : "bg-blue-100 text-blue-800"
                      )} variant="secondary">
                        {mv.confidence}%
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
