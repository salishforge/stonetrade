"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Dot } from "recharts";

interface PricePoint {
  price: number;
  source: string;
  date: string;
}

const SOURCE_COLORS: Record<string, string> = {
  COMPLETED_SALE: "#22c55e",
  SELLER_LISTING: "#3b82f6",
  BUYLIST_OFFER: "#f59e0b",
  COMMUNITY_POLL: "#a855f7",
  MANUAL_REPORT: "#6b7280",
  EBAY_SOLD: "#ef4444",
  AI_ESTIMATE: "#06b6d4",
};

function CustomDot(props: Record<string, unknown>) {
  const { cx, cy, payload } = props;
  const point = payload as PricePoint;
  const color = SOURCE_COLORS[point.source] ?? "#6b7280";
  return <Dot cx={cx as number} cy={cy as number} r={4} fill={color} stroke="white" strokeWidth={1} />;
}

export function PriceChart({ cardId }: { cardId: string }) {
  const [data, setData] = useState<PricePoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/prices/${cardId}/history?days=90`)
      .then((r) => r.json())
      .then((res) => {
        setData(res.data ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [cardId]);

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Price History</CardTitle></CardHeader>
        <CardContent><div className="h-48 flex items-center justify-center text-sm text-muted-foreground">Loading...</div></CardContent>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Price History</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-muted-foreground py-8 text-center">No price history yet.</p></CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Price History (90 days)</CardTitle>
        <div className="flex flex-wrap gap-3 mt-2">
          {Object.entries(SOURCE_COLORS).map(([source, color]) => (
            <div key={source} className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
              {source.replace("_", " ")}
            </div>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data}>
            <XAxis
              dataKey="date"
              tickFormatter={(d: string) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              tick={{ fontSize: 10 }}
            />
            <YAxis
              tickFormatter={(v: number) => `$${v}`}
              tick={{ fontSize: 10 }}
              width={50}
            />
            <Tooltip
              formatter={(value: unknown) => [`$${Number(value).toFixed(2)}`, "Price"]}
              labelFormatter={(label: unknown) => new Date(String(label)).toLocaleDateString()}
            />
            <Line
              type="monotone"
              dataKey="price"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={<CustomDot />}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
