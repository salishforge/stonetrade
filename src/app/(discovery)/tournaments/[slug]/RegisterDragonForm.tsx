"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Eligible = {
  id: string;
  label: string;
  currentPoints: number;
  appointedRiderId: string | null;
  appointedRiderLabel: string | null;
};

export function RegisterDragonForm({
  eventSlug,
  eligible,
}: {
  eventSlug: string;
  eligible: Eligible[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dragonId, setDragonId] = useState(eligible[0]?.id ?? "");
  const [riderId, setRiderId] = useState(eligible[0]?.appointedRiderId ?? "");
  const [riderInput, setRiderInput] = useState("");
  const [declared, setDeclared] = useState<string>(
    String(eligible[0]?.currentPoints ?? 0),
  );
  const [error, setError] = useState<string | null>(null);

  // Update declared + rider defaults synchronously in the change handler so
  // the picker doesn't drive a setState-in-effect cascade.
  function pickDragon(nextId: string) {
    setDragonId(nextId);
    const d = eligible.find((e) => e.id === nextId);
    if (d) {
      setDeclared(String(d.currentPoints));
      setRiderId(d.appointedRiderId ?? "");
    }
  }

  if (eligible.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        You don&apos;t have any eligible Dragons. Build a binder past 10,000 points or join a pack with a ratified contract.
      </p>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    let resolvedRiderId = riderId;
    if (!resolvedRiderId && riderInput) {
      const lookup = await fetch(
        `/api/users/lookup?username=${encodeURIComponent(riderInput.trim())}`,
      );
      if (!lookup.ok) {
        setError("Rider username not found");
        return;
      }
      const { data } = await lookup.json();
      resolvedRiderId = data?.id ?? "";
    }
    if (!resolvedRiderId) {
      setError("A Dragon Rider is required to register");
      return;
    }

    const res = await fetch(`/api/tournaments/${eventSlug}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dragonRegistrationId: dragonId,
        dragonRiderUserId: resolvedRiderId,
        declaredPoints: parseInt(declared, 10) || 0,
      }),
    });
    const body = await res.json();
    if (!res.ok) {
      setError(body.error ?? "Registration failed");
      return;
    }
    startTransition(() => router.refresh());
  }

  const picked = eligible.find((e) => e.id === dragonId);

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="dragon-pick">Dragon</Label>
        <select
          id="dragon-pick"
          value={dragonId}
          onChange={(e) => pickDragon(e.target.value)}
          className="w-full h-9 rounded-md border bg-transparent px-2 text-sm"
        >
          {eligible.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label} — {d.currentPoints.toLocaleString()} pts
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="declared">Declared points</Label>
        <Input
          id="declared"
          type="number"
          min={1}
          max={picked?.currentPoints ?? 10_000_000}
          value={declared}
          onChange={(e) => setDeclared(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          May be lower than your current strength to give a safety margin against accidental over-declaration.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="rider">Dragon Rider</Label>
        {picked?.appointedRiderId ? (
          <p className="text-sm">
            {picked.appointedRiderLabel} (appointed){" "}
            <button
              type="button"
              className="text-xs underline text-muted-foreground"
              onClick={() => setRiderId("")}
            >
              override
            </button>
          </p>
        ) : (
          <Input
            id="rider"
            value={riderInput}
            onChange={(e) => setRiderInput(e.target.value)}
            placeholder="Stoneseeker username"
          />
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={pending}>
        Register Dragon
      </Button>
    </form>
  );
}
