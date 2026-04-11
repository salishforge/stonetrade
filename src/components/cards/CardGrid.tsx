"use client";

import Link from "next/link";
import { CardImage } from "./CardImage";
import { Badge } from "@/components/ui/badge";

interface CardData {
  id: string;
  name: string;
  cardNumber: string;
  orbital: string | null;
  rarity: string;
  cardType: string;
  treatment: string;
  game: { name: string; slug: string };
  set: { name: string; code: string };
  marketValue: {
    marketMid: unknown;
    confidence: number;
  } | null;
}

function formatPrice(value: unknown): string {
  if (value === null || value === undefined) return "—";
  const num = typeof value === "string" ? parseFloat(value) : Number(value);
  if (isNaN(num)) return "—";
  return `$${num.toFixed(2)}`;
}

export function CardGrid({ cards }: { cards: CardData[] }) {
  if (cards.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        No cards found. Try adjusting your filters.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      {cards.map((card) => (
        <Link
          key={card.id}
          href={`/card/${card.id}`}
          className="group block space-y-2"
        >
          <CardImage
            name={card.name}
            orbital={card.orbital}
            rarity={card.rarity}
            className="transition-transform group-hover:scale-[1.02]"
          />
          <div className="space-y-0.5 px-0.5">
            <p className="text-sm font-medium leading-tight truncate">{card.name}</p>
            <div className="flex items-center gap-1.5">
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {card.rarity}
              </Badge>
              {card.orbital && (
                <span className="text-[10px] text-muted-foreground">{card.orbital}</span>
              )}
            </div>
            <p className="text-sm font-semibold">
              {card.marketValue
                ? formatPrice(card.marketValue.marketMid)
                : <span className="text-muted-foreground text-xs">No price data</span>
              }
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}
