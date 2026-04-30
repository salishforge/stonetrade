"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// Scale rows look exactly like what /api/dragon-scales returns. Kept loose so
// a server-rendered initial payload and a client-fetched refresh share the
// same React component without translation.
type Scale = {
  id: string;
  treatment: string;
  bonusVariant: string;
  quantity: number;
  pointsCached: number;
  serialNumber: string | null;
  card: {
    id: string;
    name: string;
    cardNumber: string;
    rarity: string;
    isStoneseeker: boolean;
    isLoreMythic: boolean;
    isToken: boolean;
    set: { code: string; name: string };
  };
};

export function ScalesTable({ initialScales }: { initialScales: Scale[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleDelete(id: string) {
    if (!confirm("Remove this Dragon Scale from your binder?")) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/dragon-scales/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(body.error ?? "Failed to remove scale");
        return;
      }
      // Server-rendered totals + the registration card refresh together.
      startTransition(() => router.refresh());
    } finally {
      setBusyId(null);
    }
  }

  if (initialScales.length === 0) {
    return (
      <div className="text-center py-16 border rounded-lg">
        <p className="text-muted-foreground mb-2">Your Dragon Binder is empty.</p>
        <p className="text-xs text-muted-foreground">
          Use “Add Scale” above to add foil cards from the catalog.
        </p>
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="text-left px-4 py-2 font-medium">Card</th>
            <th className="text-left px-4 py-2 font-medium">Set</th>
            <th className="text-left px-4 py-2 font-medium">Rarity</th>
            <th className="text-left px-4 py-2 font-medium">Treatment</th>
            <th className="text-left px-4 py-2 font-medium">Bonus</th>
            <th className="text-right px-4 py-2 font-medium">Qty</th>
            <th className="text-right px-4 py-2 font-medium">Points</th>
            <th className="px-4 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {initialScales.map((s) => (
            <tr key={s.id} className="border-t hover:bg-muted/30">
              <td className="px-4 py-3">
                <div className="font-medium">{s.card.name}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                  {s.card.cardNumber}
                  {s.card.isStoneseeker && (
                    <Badge variant="outline" className="text-[10px] px-1 py-0">Stoneseeker</Badge>
                  )}
                  {s.card.isLoreMythic && (
                    <Badge variant="outline" className="text-[10px] px-1 py-0">Lore Mythic</Badge>
                  )}
                  {s.card.isToken && (
                    <Badge variant="outline" className="text-[10px] px-1 py-0">Token</Badge>
                  )}
                </div>
              </td>
              <td className="px-4 py-3 text-muted-foreground">{s.card.set.code}</td>
              <td className="px-4 py-3">{s.card.rarity}</td>
              <td className="px-4 py-3">
                <Badge variant="outline" className="text-xs">{s.treatment}</Badge>
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {s.bonusVariant === "NONE" ? "—" : s.bonusVariant.replace(/_/g, " ")}
              </td>
              <td className="px-4 py-3 text-right">{s.quantity}</td>
              <td className="px-4 py-3 text-right font-medium">
                {s.pointsCached.toLocaleString()}
              </td>
              <td className="px-4 py-3 text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending || busyId === s.id}
                  onClick={() => handleDelete(s.id)}
                >
                  Remove
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
