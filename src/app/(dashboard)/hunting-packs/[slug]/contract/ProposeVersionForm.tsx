"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Member = {
  userId: string;
  username: string;
  displayName: string | null;
};

type ManualRow = { userId: string; percent: number };

export function ProposeVersionForm({
  packId,
  members,
  currentRiderUserId,
}: {
  packId: string;
  members: Member[];
  currentRiderUserId: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [payoutMode, setPayoutMode] = useState<"MANUAL" | "PROPORTIONAL_BY_SCALES">(
    "PROPORTIONAL_BY_SCALES",
  );
  const [riderPaymentMode, setRiderPaymentMode] = useState<"FIXED_AMOUNT" | "PERCENT">("PERCENT");
  const [riderPaymentValue, setRiderPaymentValue] = useState<string>("10");
  const [dragonRiderUserId, setDragonRiderUserId] = useState<string>(currentRiderUserId ?? "");
  const [notes, setNotes] = useState("");

  // Manual allocation: even split as default; user can adjust each row.
  const evenPct = members.length > 0 ? +(100 / members.length).toFixed(2) : 0;
  const [manual, setManual] = useState<ManualRow[]>(
    members.map((m) => ({ userId: m.userId, percent: evenPct })),
  );
  const [error, setError] = useState<string | null>(null);

  function setRow(userId: string, percent: number) {
    setManual((rows) => rows.map((r) => (r.userId === userId ? { ...r, percent } : r)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const body: Record<string, unknown> = {
      payoutMode,
      riderPaymentMode,
      riderPaymentValue: parseFloat(riderPaymentValue) || 0,
      dragonRiderUserId: dragonRiderUserId || null,
      notes: notes || undefined,
    };
    if (payoutMode === "MANUAL") {
      body.manualAllocations = manual;
    }

    const res = await fetch(`/api/hunting-packs/${packId}/contract/versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(
        data.error +
          (data.details
            ? ": " + data.details.map((d: { message?: string }) => d.message).filter(Boolean).join(", ")
            : ""),
      );
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="payout-mode">Payout mode</Label>
          <select
            id="payout-mode"
            value={payoutMode}
            onChange={(e) =>
              setPayoutMode(e.target.value as "MANUAL" | "PROPORTIONAL_BY_SCALES")
            }
            className="w-full h-9 rounded-md border bg-transparent px-2 text-sm"
          >
            <option value="PROPORTIONAL_BY_SCALES">Proportional by scale points</option>
            <option value="MANUAL">Manual percentages</option>
          </select>
          <p className="text-xs text-muted-foreground">
            Applied to the prize pool after the rider payment is deducted.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="rider">Dragon Rider</Label>
          <select
            id="rider"
            value={dragonRiderUserId}
            onChange={(e) => setDragonRiderUserId(e.target.value)}
            className="w-full h-9 rounded-md border bg-transparent px-2 text-sm"
          >
            <option value="">— none yet —</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.displayName ?? m.username} (member)
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="rider-mode">Rider payment mode</Label>
          <select
            id="rider-mode"
            value={riderPaymentMode}
            onChange={(e) =>
              setRiderPaymentMode(e.target.value as "FIXED_AMOUNT" | "PERCENT")
            }
            className="w-full h-9 rounded-md border bg-transparent px-2 text-sm"
          >
            <option value="PERCENT">Percent of prize</option>
            <option value="FIXED_AMOUNT">Fixed USD amount</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="rider-value">
            Rider payment {riderPaymentMode === "PERCENT" ? "(%)" : "(USD)"}
          </Label>
          <Input
            id="rider-value"
            type="number"
            min={0}
            max={riderPaymentMode === "PERCENT" ? 100 : 99999999}
            step="0.01"
            value={riderPaymentValue}
            onChange={(e) => setRiderPaymentValue(e.target.value)}
          />
        </div>
      </div>

      {payoutMode === "MANUAL" && (
        <div className="space-y-2">
          <Label>Manual allocations (must total 100%)</Label>
          <div className="border rounded-md divide-y">
            {manual.map((row) => {
              const m = members.find((mm) => mm.userId === row.userId);
              return (
                <div key={row.userId} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span>{m?.displayName ?? m?.username}</span>
                  <Input
                    type="number"
                    className="w-24"
                    min={0}
                    max={100}
                    step="0.01"
                    value={row.percent}
                    onChange={(e) => setRow(row.userId, parseFloat(e.target.value) || 0)}
                  />
                </div>
              );
            })}
            <div className="flex justify-between px-3 py-2 text-xs text-muted-foreground">
              <span>Total</span>
              <span>{manual.reduce((s, r) => s + r.percent, 0).toFixed(2)}%</span>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="notes">Notes (optional)</Label>
        <Textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Any additional terms recorded as part of the canonical body."
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" disabled={pending}>
        Propose version (re-opens signatures)
      </Button>
    </form>
  );
}
