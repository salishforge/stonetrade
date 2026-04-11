"use client";

import { cn } from "@/lib/utils";

interface CardImageProps {
  name: string;
  imageUrl?: string | null;
  orbital?: string | null;
  rarity?: string;
  className?: string;
}

const ORBITAL_COLORS: Record<string, string> = {
  Petraia: "from-amber-700 to-amber-900",
  Solfera: "from-red-500 to-orange-600",
  Thalwind: "from-cyan-400 to-blue-600",
  Umbrathene: "from-purple-600 to-indigo-900",
  Heliosynth: "from-yellow-300 to-green-500",
  Boundless: "from-gray-400 to-gray-600",
};

const RARITY_BORDER: Record<string, string> = {
  Common: "border-gray-300",
  Uncommon: "border-green-500",
  Rare: "border-blue-500",
  Epic: "border-purple-500",
  Mythic: "border-amber-400",
  SP: "border-red-500",
  SSP: "border-red-600",
};

export function CardImage({ name, imageUrl, orbital, rarity, className }: CardImageProps) {
  if (imageUrl) {
    return (
      <div className={cn("relative aspect-[2.5/3.5] rounded-lg overflow-hidden border-2", RARITY_BORDER[rarity ?? ""] ?? "border-border", className)}>
        <img src={imageUrl} alt={name} className="w-full h-full object-cover" />
      </div>
    );
  }

  // Placeholder with orbital gradient
  const gradient = ORBITAL_COLORS[orbital ?? ""] ?? "from-gray-500 to-gray-700";

  return (
    <div
      className={cn(
        "relative aspect-[2.5/3.5] rounded-lg overflow-hidden border-2 bg-gradient-to-br flex items-end p-3",
        gradient,
        RARITY_BORDER[rarity ?? ""] ?? "border-border",
        className,
      )}
    >
      <div className="text-white">
        <p className="text-xs font-medium opacity-70">{orbital ?? "Unknown"}</p>
        <p className="text-sm font-bold leading-tight">{name}</p>
      </div>
    </div>
  );
}
