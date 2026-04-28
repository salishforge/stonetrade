"use client";

import Link from "next/link";
import { CardImage } from "@/components/cards/CardImage";

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
      className="group block transition-transform duration-200 ease-out hover:-translate-y-0.5"
    >
      {listing.card && (
        <CardImage
          name={listing.card.name}
          imageUrl={listing.card.imageUrl}
          orbital={listing.card.orbital}
          rarity={listing.card.rarity}
          className="mb-3 group-hover:shadow-[0_8px_24px_rgba(0,0,0,0.55),0_4px_8px_rgba(0,0,0,0.3)]"
        />
      )}
      <div className="space-y-1 px-0.5">
        <p className="text-[13px] font-medium leading-tight text-ink-primary truncate">
          {listing.card?.name ?? "Unknown Card"}
        </p>
        <div className="flex items-baseline gap-2 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-muted">
          {listing.condition && <span>{listing.condition.replace("_", " ").toLowerCase()}</span>}
          {listing.treatment && <span>· {listing.treatment}</span>}
        </div>
        <p className="font-mono text-[14px] tabular-nums text-ink-primary">
          ${Number(listing.price).toFixed(2)}
        </p>
        <div className="flex items-baseline justify-between font-mono text-[10px] uppercase tracking-[0.08em] text-ink-muted">
          <span>{listing.seller.username}</span>
          {remaining > 1 && <span>×{remaining}</span>}
        </div>
      </div>
    </Link>
  );
}
