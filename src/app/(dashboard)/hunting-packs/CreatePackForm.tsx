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

export function CreatePackForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onNameChange(v: string) {
    setName(v);
    if (!slugTouched) setSlug(slugify(v));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/hunting-packs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, slug }),
    });
    const body = await res.json();
    if (!res.ok) {
      setError(body.error ?? "Failed to create pack");
      return;
    }
    startTransition(() => router.push(`/hunting-packs/${body.data.slug}`));
  }

  return (
    <Card>
      <CardContent className="pt-4">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="pack-name">Pack name</Label>
            <Input
              id="pack-name"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="Stoneseekers United"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pack-slug">URL slug</Label>
            <Input
              id="pack-slug"
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value);
              }}
              placeholder="stoneseekers-united"
              required
            />
            <p className="text-xs text-muted-foreground">
              /hunting-packs/{slug || "your-slug"}
            </p>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={pending || !name || !slug}>
            Create Pack
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
