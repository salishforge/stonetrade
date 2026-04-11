"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Treatment {
  id: string;
  treatment: string;
  isSerialized: boolean;
  serialTotal: number | null;
  marketValue: { marketMid: unknown; confidence: number } | null;
}

interface TreatmentTabsProps {
  treatments: Treatment[];
  activeTreatment: string;
  onSelect: (treatmentId: string) => void;
}

function formatPrice(value: unknown): string {
  if (value === null || value === undefined) return "—";
  const num = typeof value === "string" ? parseFloat(value) : Number(value);
  if (isNaN(num)) return "—";
  return `$${num.toFixed(2)}`;
}

export function TreatmentTabs({ treatments, activeTreatment, onSelect }: TreatmentTabsProps) {
  return (
    <Tabs value={activeTreatment} onValueChange={onSelect}>
      <TabsList className="flex-wrap h-auto gap-1">
        {treatments.map((t) => (
          <TabsTrigger key={t.id} value={t.id} className="text-xs px-3 py-1.5">
            <span>{t.treatment}</span>
            {t.isSerialized && t.serialTotal && (
              <span className="ml-1 text-muted-foreground">/{t.serialTotal}</span>
            )}
            {t.marketValue?.marketMid != null && (
              <span className="ml-1.5 font-semibold">
                {formatPrice(t.marketValue.marketMid)}
              </span>
            )}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
