"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Entry = {
  registrationId: string;
  label: string;
  riderLabel: string;
  declaredPoints: number;
  finishingPosition: number | null;
};

export function ResultsForm({
  slug,
  entries,
}: {
  slug: string;
  entries: Entry[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [positions, setPositions] = useState<Record<string, string>>(
    Object.fromEntries(
      entries.map((e) => [e.registrationId, e.finishingPosition ? String(e.finishingPosition) : ""]),
    ),
  );
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSummary(null);

    const results = entries
      .map((e) => ({
        registrationId: e.registrationId,
        finishingPosition: parseInt(positions[e.registrationId] ?? "", 10),
      }))
      .filter((r) => Number.isFinite(r.finishingPosition) && r.finishingPosition > 0);

    if (results.length === 0) {
      setError("Set at least one finishing position");
      return;
    }

    const res = await fetch(`/api/tournaments/${slug}/results`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ results }),
    });
    const body = await res.json();
    if (!res.ok) {
      setError(body.error ?? "Failed");
      return;
    }
    setSummary(`Recorded ${body.data.resultsRecorded} results.`);
    startTransition(() => router.refresh());
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="border rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Dragon</th>
              <th className="text-left px-3 py-2 font-medium">Rider</th>
              <th className="text-right px-3 py-2 font-medium">Declared</th>
              <th className="text-left px-3 py-2 font-medium">Finishing position</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.registrationId} className="border-t">
                <td className="px-3 py-2">{e.label}</td>
                <td className="px-3 py-2">{e.riderLabel}</td>
                <td className="px-3 py-2 text-right">{e.declaredPoints.toLocaleString()}</td>
                <td className="px-3 py-2">
                  <Input
                    type="number"
                    min={1}
                    className="w-24"
                    value={positions[e.registrationId] ?? ""}
                    onChange={(ev) =>
                      setPositions({ ...positions, [e.registrationId]: ev.target.value })
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {summary && <p className="text-sm text-green-700">{summary}</p>}

      <Button type="submit" disabled={pending}>
        Compute payouts (replaces any existing results)
      </Button>
    </form>
  );
}
