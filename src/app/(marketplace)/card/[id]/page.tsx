import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { CardImage } from "@/components/cards/CardImage";
import { CardDetailPanel } from "@/components/cards/CardDetailPanel";
import { MarketValueCard } from "@/components/pricing/MarketValueCard";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

export default async function CardDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const card = await prisma.card.findUnique({
    where: { id },
    include: {
      game: true,
      set: true,
      marketValue: true,
      listings: {
        where: { status: "ACTIVE" },
        include: {
          seller: {
            select: { username: true, sellerRating: true, totalSales: true },
          },
        },
        orderBy: { price: "asc" },
        take: 10,
      },
    },
  });

  if (!card) notFound();

  // Fetch all treatment variants
  const treatments = await prisma.card.findMany({
    where: { setId: card.setId, cardNumber: card.cardNumber },
    select: {
      id: true,
      treatment: true,
      isSerialized: true,
      serialTotal: true,
      marketValue: { select: { marketMid: true, confidence: true } },
    },
    orderBy: { treatment: "asc" },
  });

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-4">
        <Link
          href="/browse"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          &larr; Back to Browse
        </Link>
      </div>

      <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
        {/* Left: Card Image */}
        <div>
          <CardImage
            name={card.name}
            imageUrl={card.imageUrl}
            orbital={card.orbital}
            rarity={card.rarity}
            className="w-full max-w-[280px]"
          />

          {/* Treatment variants */}
          <div className="mt-4 space-y-1">
            <p className="text-xs font-medium text-muted-foreground mb-2">
              Treatments
            </p>
            {treatments.map((t) => (
              <Link
                key={t.id}
                href={`/card/${t.id}`}
                className={`block px-3 py-1.5 rounded-md text-sm transition-colors ${
                  t.id === card.id
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted"
                }`}
              >
                <span>{t.treatment}</span>
                {t.isSerialized && t.serialTotal && (
                  <span className="text-xs ml-1 opacity-70">/{t.serialTotal}</span>
                )}
              </Link>
            ))}
          </div>
        </div>

        {/* Right: Details */}
        <div className="space-y-6">
          <CardDetailPanel card={card} />
          <MarketValueCard marketValue={card.marketValue} />

          {/* Active Listings */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                Active Listings ({card.listings.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {card.listings.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No active listings for this card.
                </p>
              ) : (
                <div className="space-y-2">
                  {card.listings.map((listing) => (
                    <Link
                      key={listing.id}
                      href={`/listing/${listing.id}`}
                      className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-muted"
                    >
                      <div>
                        <span className="text-sm font-medium">
                          ${Number(listing.price).toFixed(2)}
                        </span>
                        <span className="text-xs text-muted-foreground ml-2">
                          {listing.condition?.replace("_", " ")}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {listing.seller.username}
                        {listing.seller.totalSales > 0 && (
                          <span className="ml-1">
                            ({listing.seller.totalSales} sales)
                          </span>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
