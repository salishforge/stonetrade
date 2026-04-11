import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { CardImage } from "@/components/cards/CardImage";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Link from "next/link";

export default async function ListingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const listing = await prisma.listing.findUnique({
    where: { id },
    include: {
      card: {
        include: {
          game: { select: { name: true, slug: true } },
          set: { select: { name: true, code: true } },
          marketValue: { select: { marketMid: true, confidence: true } },
        },
      },
      seller: {
        select: { username: true, sellerRating: true, totalSales: true, country: true, memberSince: true },
      },
    },
  });

  if (!listing) notFound();

  const marketMid = listing.card?.marketValue?.marketMid;

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-4">
        <Link href="/browse" className="text-sm text-muted-foreground hover:text-foreground">
          &larr; Back to Browse
        </Link>
      </div>

      <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
        {/* Left: Card Image */}
        <div>
          {listing.card && (
            <Link href={`/card/${listing.card.id}`}>
              <CardImage
                name={listing.card.name}
                imageUrl={listing.card.imageUrl}
                orbital={listing.card.orbital}
                rarity={listing.card.rarity}
                className="w-full max-w-[280px]"
              />
            </Link>
          )}
        </div>

        {/* Right: Listing Details */}
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold">{listing.card?.name ?? "Unknown Card"}</h1>
            <p className="text-muted-foreground">
              {listing.card?.cardNumber} &middot; {listing.card?.set.name}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {listing.condition && (
              <Badge>{listing.condition.replace("_", " ")}</Badge>
            )}
            {listing.treatment && (
              <Badge variant="outline">{listing.treatment}</Badge>
            )}
            {listing.serialNumber && (
              <Badge variant="secondary">#{listing.serialNumber}</Badge>
            )}
          </div>

          {/* Price */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-baseline gap-4">
                <span className="text-3xl font-bold">
                  ${Number(listing.price).toFixed(2)}
                </span>
                {marketMid && (
                  <span className="text-sm text-muted-foreground">
                    Market: ${Number(marketMid).toFixed(2)}
                  </span>
                )}
              </div>
              {listing.allowOffers && (
                <p className="text-sm text-muted-foreground mt-1">
                  Seller accepts offers
                  {listing.minimumOffer && (
                    <span> (min ${Number(listing.minimumOffer).toFixed(2)})</span>
                  )}
                </p>
              )}
              <div className="flex gap-3 mt-4">
                <a
                  href="#"
                  className={cn(buttonVariants({ size: "lg" }), "flex-1 text-center")}
                >
                  Buy Now
                </a>
                {listing.allowOffers && (
                  <a
                    href="#"
                    className={cn(buttonVariants({ variant: "outline", size: "lg" }), "flex-1 text-center")}
                  >
                    Make Offer
                  </a>
                )}
              </div>
            </CardContent>
          </Card>

          <Separator />

          {/* Seller Info */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Seller</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-medium">{listing.seller.username}</p>
              <div className="text-sm text-muted-foreground space-y-0.5 mt-1">
                <p>{listing.seller.totalSales} sales completed</p>
                {listing.seller.country && <p>Ships from {listing.seller.country}</p>}
                <p>
                  Member since{" "}
                  {new Date(listing.seller.memberSince).toLocaleDateString("en-US", {
                    month: "short",
                    year: "numeric",
                  })}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Shipping */}
          {listing.shippingOptions && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Shipping</CardTitle>
              </CardHeader>
              <CardContent>
                {(listing.shippingOptions as Array<{ method: string; price: number }>).map(
                  (opt, i) => (
                    <div key={i} className="flex justify-between text-sm py-1">
                      <span>{opt.method}</span>
                      <span>${opt.price.toFixed(2)}</span>
                    </div>
                  ),
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
