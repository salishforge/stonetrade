"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

interface CardDetailPanelProps {
  card: {
    name: string;
    cardNumber: string;
    orbital: string | null;
    rarity: string;
    cardType: string;
    treatment: string;
    isSerialized: boolean;
    serialTotal: number | null;
    buildPoints: number | null;
    rulesText: string | null;
    flavorText: string | null;
    artist: string | null;
    game: { name: string };
    set: { name: string; code: string };
  };
}

export function CardDetailPanel({ card }: CardDetailPanelProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-xl">{card.name}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {card.cardNumber} &middot; {card.set.name} ({card.set.code})
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Badge>{card.rarity}</Badge>
          <Badge variant="outline">{card.cardType}</Badge>
          <Badge variant="secondary">{card.treatment}</Badge>
          {card.orbital && <Badge variant="outline">{card.orbital}</Badge>}
        </div>

        {card.isSerialized && (
          <p className="text-sm">
            Serialized{card.serialTotal ? ` — /${card.serialTotal}` : " — 1/1"}
          </p>
        )}

        {card.buildPoints != null && (
          <p className="text-sm text-muted-foreground">
            Build Points: {card.buildPoints}
          </p>
        )}

        {card.rulesText && (
          <>
            <Separator />
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Rules Text</p>
              <p className="text-sm">{card.rulesText}</p>
            </div>
          </>
        )}

        {card.flavorText && (
          <p className="text-sm italic text-muted-foreground">{card.flavorText}</p>
        )}

        {card.artist && (
          <p className="text-xs text-muted-foreground">Artist: {card.artist}</p>
        )}

        <Separator />
        <p className="text-xs text-muted-foreground">{card.game.name}</p>
      </CardContent>
    </Card>
  );
}
