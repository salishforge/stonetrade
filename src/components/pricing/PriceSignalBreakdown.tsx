"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const SOURCE_LABELS: Record<string, string> = {
  COMPLETED_SALE: "Sales",
  SELLER_LISTING: "Listings",
  BUYLIST_OFFER: "Buylists",
  COMMUNITY_POLL: "Poll Votes",
  MANUAL_REPORT: "Reports",
  EBAY_SOLD: "eBay Sales",
  AI_ESTIMATE: "AI Estimates",
};

const SOURCE_COLORS: Record<string, string> = {
  COMPLETED_SALE: "bg-green-500",
  SELLER_LISTING: "bg-blue-500",
  BUYLIST_OFFER: "bg-amber-500",
  COMMUNITY_POLL: "bg-purple-500",
  MANUAL_REPORT: "bg-gray-500",
  EBAY_SOLD: "bg-red-500",
  AI_ESTIMATE: "bg-cyan-500",
};

export function PriceSignalBreakdown({ sourceCounts }: { sourceCounts: Record<string, number> }) {
  const total = Object.values(sourceCounts).reduce((a, b) => a + b, 0);

  if (total === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Price Signal Sources</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {/* Stacked bar */}
        <div className="flex h-3 rounded-full overflow-hidden">
          {Object.entries(sourceCounts).map(([source, count]) => (
            <div
              key={source}
              className={SOURCE_COLORS[source] ?? "bg-gray-400"}
              style={{ width: `${(count / total) * 100}%` }}
            />
          ))}
        </div>

        {/* Legend */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          {Object.entries(sourceCounts)
            .sort(([, a], [, b]) => b - a)
            .map(([source, count]) => (
              <div key={source} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <div className={`w-2 h-2 rounded-full ${SOURCE_COLORS[source] ?? "bg-gray-400"}`} />
                  <span>{SOURCE_LABELS[source] ?? source}</span>
                </div>
                <span className="text-muted-foreground">{count}</span>
              </div>
            ))}
        </div>
        <p className="text-xs text-muted-foreground text-center pt-1">
          {total} total data point{total !== 1 ? "s" : ""}
        </p>
      </CardContent>
    </Card>
  );
}
