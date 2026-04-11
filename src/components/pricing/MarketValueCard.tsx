"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfidenceBadge } from "./ConfidenceBadge";

interface MarketValueCardProps {
  marketValue: {
    marketLow: unknown;
    marketMid: unknown;
    marketHigh: unknown;
    confidence: number;
    totalSales: number;
    totalListings: number;
    totalBuylist: number;
    totalPollVotes: number;
  } | null;
}

function formatPrice(value: unknown): string {
  if (value === null || value === undefined) return "—";
  const num = typeof value === "string" ? parseFloat(value) : Number(value);
  if (isNaN(num)) return "—";
  return `$${num.toFixed(2)}`;
}

export function MarketValueCard({ marketValue }: MarketValueCardProps) {
  if (!marketValue || marketValue.confidence === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Market Value</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No price data available yet. Be the first to{" "}
            <a href="/report-sale" className="underline">report a sale</a> or{" "}
            <a href="/polls" className="underline">vote in a price poll</a>.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Market Value</CardTitle>
          <ConfidenceBadge confidence={marketValue.confidence} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-xs text-muted-foreground">Low</p>
            <p className="text-lg font-semibold">{formatPrice(marketValue.marketLow)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Mid</p>
            <p className="text-xl font-bold">{formatPrice(marketValue.marketMid)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">High</p>
            <p className="text-lg font-semibold">{formatPrice(marketValue.marketHigh)}</p>
          </div>
        </div>
        <div className="flex justify-center gap-4 text-xs text-muted-foreground">
          <span>{marketValue.totalSales} sales</span>
          <span>{marketValue.totalListings} listings</span>
          <span>{marketValue.totalBuylist} buylists</span>
          <span>{marketValue.totalPollVotes} votes</span>
        </div>
      </CardContent>
    </Card>
  );
}
