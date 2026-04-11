"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

const ORBITALS = ["Petraia", "Solfera", "Thalwind", "Umbrathene", "Heliosynth", "Boundless"];
const RARITIES = ["Common", "Uncommon", "Rare", "Epic", "Mythic"];
const CARD_TYPES = ["Wonder", "Spell", "Item", "Land"];
const TREATMENTS = ["Classic Paper", "Classic Foil", "Formless Foil", "OCM", "Stonefoil"];

export function SearchFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const updateFilter = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value && value !== "all") {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      params.set("page", "1");
      router.push(`/browse?${params.toString()}`);
    },
    [router, searchParams],
  );

  const clearAll = useCallback(() => {
    router.push("/browse");
  }, [router]);

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="search" className="text-xs mb-1.5">Search</Label>
        <Input
          id="search"
          placeholder="Card name..."
          defaultValue={searchParams.get("q") ?? ""}
          onChange={(e) => {
            const value = e.target.value;
            // Debounce-like: update on empty or 2+ chars
            if (value.length === 0 || value.length >= 2) {
              updateFilter("q", value || null);
            }
          }}
        />
      </div>

      <div>
        <Label className="text-xs mb-1.5">Game</Label>
        <Select
          value={searchParams.get("game") ?? "all"}
          onValueChange={(v) => updateFilter("game", v)}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Games</SelectItem>
            <SelectItem value="wotf">Wonders of the First</SelectItem>
            <SelectItem value="bjba">Bo Jackson Battle Arena</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-xs mb-1.5">Orbital</Label>
        <Select
          value={searchParams.get("orbital") ?? "all"}
          onValueChange={(v) => updateFilter("orbital", v)}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Orbitals</SelectItem>
            {ORBITALS.map((o) => (
              <SelectItem key={o} value={o}>{o}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-xs mb-1.5">Rarity</Label>
        <Select
          value={searchParams.get("rarity") ?? "all"}
          onValueChange={(v) => updateFilter("rarity", v)}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Rarities</SelectItem>
            {RARITIES.map((r) => (
              <SelectItem key={r} value={r}>{r}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-xs mb-1.5">Type</Label>
        <Select
          value={searchParams.get("cardType") ?? "all"}
          onValueChange={(v) => updateFilter("cardType", v)}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {CARD_TYPES.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-xs mb-1.5">Treatment</Label>
        <Select
          value={searchParams.get("treatment") ?? "all"}
          onValueChange={(v) => updateFilter("treatment", v)}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Classic Paper</SelectItem>
            {TREATMENTS.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button variant="outline" size="sm" onClick={clearAll} className="w-full">
        Clear Filters
      </Button>
    </div>
  );
}
