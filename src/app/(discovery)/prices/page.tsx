import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Link from "next/link";

export default async function PricesPage() {
  // Cards needing data: fewest data points
  const cardsNeedingData = await prisma.card.findMany({
    where: { treatment: "Classic Paper" },
    include: {
      _count: { select: { priceHistory: true } },
      marketValue: { select: { marketMid: true, confidence: true } },
    },
    orderBy: { priceHistory: { _count: "asc" } },
    take: 10,
  });

  // Top movers (cards with market values and trends)
  const topMovers = await prisma.cardMarketValue.findMany({
    where: { trend7d: { not: null } },
    include: {
      card: { select: { id: true, name: true, cardNumber: true, orbital: true, rarity: true, treatment: true } },
    },
    orderBy: { trend7d: "desc" },
    take: 10,
  });

  // Recent sales
  const recentSales = await prisma.priceDataPoint.findMany({
    where: { source: "COMPLETED_SALE" },
    include: {
      card: { select: { id: true, name: true, cardNumber: true, rarity: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 15,
  });

  // Overall stats
  const [totalCards, totalWithPrices, totalDataPoints] = await Promise.all([
    prisma.card.count({ where: { treatment: "Classic Paper" } }),
    prisma.cardMarketValue.count(),
    prisma.priceDataPoint.count(),
  ]);

  const coveragePct = totalCards > 0 ? Math.round((totalWithPrices / totalCards) * 100) : 0;

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Price Discovery</h1>
        <p className="text-muted-foreground mt-1">
          Helping establish fair market values for emerging CCGs
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Data Coverage</p>
            <p className="text-2xl font-bold">{coveragePct}%</p>
            <p className="text-xs text-muted-foreground">{totalWithPrices}/{totalCards} cards priced</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Total Data Points</p>
            <p className="text-2xl font-bold">{totalDataPoints}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Contribute</p>
            <div className="flex gap-2 mt-1">
              <Link href="/report-sale" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "text-xs")}>
                Report Sale
              </Link>
              <Link href="/polls" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "text-xs")}>
                Vote
              </Link>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Recent Sales</p>
            <p className="text-2xl font-bold">{recentSales.length}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Cards needing data */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Cards Needing Data</CardTitle>
          </CardHeader>
          <CardContent>
            {cardsNeedingData.filter((c) => c._count.priceHistory < 3).length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">All cards have sufficient data!</p>
            ) : (
              <div className="space-y-2">
                {cardsNeedingData
                  .filter((c) => c._count.priceHistory < 3)
                  .map((card) => (
                    <div key={card.id} className="flex items-center justify-between py-1">
                      <Link href={`/card/${card.id}`} className="text-sm hover:underline truncate">
                        {card.name}
                      </Link>
                      <Badge variant="secondary" className="text-xs shrink-0 ml-2">
                        {card._count.priceHistory} pts
                      </Badge>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Movers */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top Movers (7d)</CardTitle>
          </CardHeader>
          <CardContent>
            {topMovers.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No trend data yet.</p>
            ) : (
              <div className="space-y-2">
                {topMovers.map((mv) => (
                  <div key={mv.id} className="flex items-center justify-between py-1">
                    <Link href={`/card/${mv.card.id}`} className="text-sm hover:underline truncate">
                      {mv.card.name}
                    </Link>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className="text-sm font-medium">
                        ${Number(mv.marketMid).toFixed(2)}
                      </span>
                      {mv.trend7d && (
                        <span className={cn("text-xs font-medium", Number(mv.trend7d) >= 0 ? "text-green-600" : "text-red-600")}>
                          {Number(mv.trend7d) >= 0 ? "+" : ""}{Number(mv.trend7d).toFixed(1)}%
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Sales */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Recent Sales</CardTitle>
          </CardHeader>
          <CardContent>
            {recentSales.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No sales recorded yet.</p>
            ) : (
              <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                {recentSales.map((sale) => (
                  <div key={sale.id} className="flex items-center justify-between border rounded-md px-3 py-2">
                    <div>
                      <Link href={`/card/${sale.card.id}`} className="text-sm font-medium hover:underline">
                        {sale.card.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {sale.treatment} &middot; {sale.condition.replace("_", " ")}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold">${Number(sale.price).toFixed(2)}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(sale.createdAt).toLocaleDateString()}
                      </p>
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
