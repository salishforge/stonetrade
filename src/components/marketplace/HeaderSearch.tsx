"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * Header search input. GET form posting to /search?q=...
 * Initializes from the current ?q= so refreshes/share-links keep their state;
 * thereafter the local state owns the input independently of URL changes.
 */
export function HeaderSearch() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  }

  return (
    <form onSubmit={onSubmit} className="hidden md:block">
      <input
        type="search"
        name="q"
        placeholder="Search cards…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="h-8 w-56 rounded-md border bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </form>
  );
}
