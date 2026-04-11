"use client";

import Link from "next/link";
import { CardImage } from "@/components/cards/CardImage";
import { Badge } from "@/components/ui/badge";

interface ListingCardProps {
  listing: {
    id: string;
    price: unknown;
    condition: string | null;
    treatment: string | null;
    quantity: number;
    quantitySold: number;
    card: {
      id: string;
      name: string;
      cardNumber: string;
      orbital: string | null;
      rarity: string;
      imageUrl: string | null;
    } | null;
    seller: {
      username: string;
      sellerRating: number | null;
      totalSales: number;
    };
  };
}

export function ListingCard({ listing }: ListingCardProps) {
  const remaining = listing.quantity - listing.quantitySold;

  return (
    <Link
      href={`/listing/${listing.id}`}
      className="group block border rounded-lg overflow-hidden hover:shadow-md transition-shadow"
    >
      <div className="p-3">
        {listing.card && (
          <CardImage
            name={listing.card.name}
            imageUrl={listing.card.imageUrl}
            orbital={listing.card.orbital}
            rarity={listing.card.rarity}
            className="mb-3"
          />
        )}
        <div className="space-y-1">
          <p className="text-sm font-medium leading-tight truncate">
            {listing.card?.name ?? "Unknown Card"}
          </p>
          <div className="flex flex-wrap gap-1">
            {listing.condition && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {listing.condition.replace("_", " ")}
              </Badge>
            )}
            {listing.treatment && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                {listing.treatment}
              </Badge>
            )}
          </div>
          <p className="text-lg font-bold">${Number(listing.price).toFixed(2)}</p>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{listing.seller.username}</span>
            {remaining > 1 && <span>{remaining} available</span>}
          </div>
        </div>
      </div>
    </Link>
  );
}
