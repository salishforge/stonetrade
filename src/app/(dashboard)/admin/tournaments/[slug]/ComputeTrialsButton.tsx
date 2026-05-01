"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function ComputeTrialsButton({ slug }: { slug: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function compute() {
    setError(null);
    setSummary(null);
    const res = await fetch(`/api/tournaments/${slug}/trials`, { method: "POST" });
    const body = await res.json();
    if (!res.ok) {
      setError(body.error ?? "Failed");
      return;
    }
    const d = body.data;
    setSummary(
      `Computed: ${d.topDragon ? "Top Dragon ✓" : "no Top Dragon"} · Top 10: ${d.top10Count} entries · Osprey sets: ${d.ospreySetsCount}`,
    );
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-2">
      <Button onClick={compute} disabled={pending}>
        Compute trial awards
      </Button>
      {summary && <p className="text-sm text-green-700">{summary}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
