"use client";

import Link from "next/link";
import { CardImage } from "./CardImage";

interface CardData {
  id: string;
  name: string;
  cardNumber: string;
  orbital: string | null;
  rarity: string;
  cardType: string;
  treatment: string;
  imageUrl?: string | null;
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
      <div className="font-mono text-[12px] uppercase tracking-[0.08em] text-ink-muted py-16 text-center">
        No cards match these filters
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
      {cards.map((card) => (
        <Link
          key={card.id}
          href={`/card/${card.id}`}
          className="group block space-y-2"
        >
          <CardImage
            name={card.name}
            imageUrl={card.imageUrl}
            orbital={card.orbital}
            rarity={card.rarity}
            className="transition-transform duration-200 ease-out group-hover:-translate-y-0.5 group-hover:shadow-[0_8px_24px_rgba(0,0,0,0.55),0_4px_8px_rgba(0,0,0,0.3)]"
          />
          <div className="space-y-1 px-0.5">
            <p className="text-[13px] font-medium leading-tight text-ink-primary truncate">
              {card.name}
            </p>
            <div className="flex items-baseline gap-2 text-[10px] uppercase tracking-[0.08em] text-ink-muted font-mono">
              <span>{card.rarity}</span>
              {card.orbital && <span>· {card.orbital}</span>}
            </div>
            <p className="font-mono text-[13px] tabular-nums">
              {card.marketValue
                ? <span className="text-ink-primary">{formatPrice(card.marketValue.marketMid)}</span>
                : <span className="text-ink-muted text-[11px] uppercase tracking-[0.08em]">No price</span>
              }
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}
