import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Link from "next/link";

export default async function PollsPage() {
  const polls = await prisma.valuePoll.findMany({
    where: { status: "ACTIVE" },
    include: {
      card: { select: { id: true, name: true, cardNumber: true, orbital: true, rarity: true } },
      _count: { select: { votes: true } },
    },
    orderBy: [
      { votes: { _count: "asc" } }, // Fewest votes first (most urgent)
    ],
    take: 30,
  });

  // Also find cards that need polls (< 3 price data points, no active poll)
  const cardsNeedingData = await prisma.card.findMany({
    where: {
      treatment: "Classic Paper",
      valuePollVotes: { none: { status: "ACTIVE" } },
    },
    include: {
      _count: { select: { priceHistory: true } },
    },
    orderBy: { priceHistory: { _count: "asc" } },
    take: 10,
  });

  const needingPolls = cardsNeedingData.filter((c) => c._count.priceHistory < 3);

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Price Polls</h1>
          <p className="text-muted-foreground mt-1">
            Help establish fair prices by voting on card values
          </p>
        </div>
      </div>

      {polls.length === 0 && needingPolls.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p>No active polls right now. Check back later!</p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Active Polls */}
          {polls.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-4">Active Polls — Vote Now</h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {polls.map((poll) => {
                  const ranges = poll.priceRanges as Array<{ label: string }>;
                  return (
                    <Card key={poll.id}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">
                          <Link href={`/card/${poll.card.id}`} className="hover:underline">
                            {poll.card.name}
                          </Link>
                        </CardTitle>
                        <p className="text-xs text-muted-foreground">
                          {poll.card.cardNumber} &middot; {poll.treatment}
                        </p>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center gap-2 mb-3">
                          <Badge variant="secondary">{poll.card.rarity}</Badge>
                          {poll.card.orbital && (
                            <Badge variant="outline">{poll.card.orbital}</Badge>
                          )}
                          <span className="text-xs text-muted-foreground ml-auto">
                            {poll._count.votes} vote{poll._count.votes !== 1 ? "s" : ""}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mb-2">
                          Range: {ranges[0]?.label} — {ranges[ranges.length - 1]?.label}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Expires {new Date(poll.expiresAt).toLocaleDateString()}
                        </p>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {/* Cards needing data */}
          {needingPolls.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-4">Cards Needing Price Data</h2>
              <p className="text-sm text-muted-foreground mb-4">
                These cards have fewer than 3 price data points. Report a sale or suggest a price poll.
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                {needingPolls.map((card) => (
                  <div key={card.id} className="flex items-center justify-between border rounded-md px-4 py-3">
                    <div>
                      <Link href={`/card/${card.id}`} className="text-sm font-medium hover:underline">
                        {card.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {card._count.priceHistory} data point{card._count.priceHistory !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <Link
                      href={`/report-sale`}
                      className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                    >
                      Report Sale
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
