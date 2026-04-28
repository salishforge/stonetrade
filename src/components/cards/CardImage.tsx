"use client";

import { cn } from "@/lib/utils";

interface CardImageProps {
  name: string;
  imageUrl?: string | null;
  orbital?: string | null;
  rarity?: string;
  className?: string;
}

// Orbital gradients — the placeholder shown when an image isn't available.
// Pulled from the platform's tokens.css.ts orbital palette, dialed deep so the
// placeholder reads as "card slot in dark wood", not "saturated tile".
const ORBITAL_COLORS: Record<string, string> = {
  Petraia: "from-[#5a4308] to-[#1f1808]",
  Solfera: "from-[#7a1322] to-[#1f0a0d]",
  Thalwind: "from-[#1d3aa8] to-[#0c1426]",
  Umbrathene: "from-[#3d1a73] to-[#15082a]",
  Heliosynth: "from-[#a87f00] to-[#2a2008]",
  Boundless: "from-[#1a5e1a] to-[#0a1a0a]",
};

// Rarity borders — warm palette only. Common/Uncommon stay neutral; Rare lifts
// to a muted brass; Epic/Mythic earn the gold accent; SP/SSP get oxidized
// crimson. No saturated indigo/purple defaults.
const RARITY_BORDER: Record<string, string> = {
  Common: "border-border/60",
  Uncommon: "border-ink-muted/60",
  Rare: "border-gold-dark",
  Epic: "border-gold/70",
  Mythic: "border-gold-light",
  SP: "border-crimson/70",
  SSP: "border-crimson-light",
};

export function CardImage({ name, imageUrl, orbital, rarity, className }: CardImageProps) {
  if (imageUrl) {
    return (
      <div
        className={cn(
          "relative aspect-[2.5/3.5] rounded-md overflow-hidden border bg-surface-overlay shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]",
          RARITY_BORDER[rarity ?? ""] ?? "border-border/60",
          className,
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt={name} className="w-full h-full object-cover" loading="lazy" />
      </div>
    );
  }

  const gradient = ORBITAL_COLORS[orbital ?? ""] ?? "from-[#1a1620] to-[#0a0810]";

  return (
    <div
      className={cn(
        "relative aspect-[2.5/3.5] rounded-md overflow-hidden border bg-gradient-to-br flex items-end p-3",
        gradient,
        RARITY_BORDER[rarity ?? ""] ?? "border-border/60",
        className,
      )}
    >
      <div className="text-ink-primary/85">
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] opacity-70">{orbital ?? "Unknown"}</p>
        <p className="text-[14px] leading-tight font-medium drop-shadow-md">{name}</p>
      </div>
    </div>
  );
}
