"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function CreateTournamentForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [eventDate, setEventDate] = useState("");
  const [basePrize, setBasePrize] = useState("50000");
  const [goldPool, setGoldPool] = useState("200000");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/tournaments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        slug,
        eventDate: new Date(eventDate).toISOString(),
        basePrizePool: parseFloat(basePrize) || 0,
        dragonGoldPool: parseFloat(goldPool) || 0,
        status: "REGISTRATION_OPEN",
      }),
    });
    const body = await res.json();
    if (!res.ok) {
      setError(body.error ?? "Failed");
      return;
    }
    startTransition(() => router.push(`/admin/tournaments/${body.data.slug}`));
  }

  return (
    <Card>
      <CardContent className="pt-4">
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="t-name">Name</Label>
            <Input
              id="t-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!slugTouched) setSlug(slugify(e.target.value));
              }}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-slug">Slug</Label>
            <Input
              id="t-slug"
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value);
              }}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-date">Event date</Label>
            <Input
              id="t-date"
              type="datetime-local"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="t-base">Base pool ($)</Label>
              <Input
                id="t-base"
                type="number"
                min={0}
                step="0.01"
                value={basePrize}
                onChange={(e) => setBasePrize(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-gold">Dragon Gold pool ($)</Label>
              <Input
                id="t-gold"
                type="number"
                min={0}
                step="0.01"
                value={goldPool}
                onChange={(e) => setGoldPool(e.target.value)}
              />
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={pending || !name || !slug || !eventDate}>
            Create event (registration open)
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
