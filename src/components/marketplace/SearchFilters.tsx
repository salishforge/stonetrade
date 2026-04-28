"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";

const ORBITALS = ["Petraia", "Solfera", "Thalwind", "Umbrathene", "Heliosynth", "Boundless"];
const RARITIES = ["Common", "Uncommon", "Rare", "Epic", "Mythic"];
const CARD_TYPES = ["Wonder", "Spell", "Item", "Land"];
const TREATMENTS = ["Classic Paper", "Classic Foil", "Formless Foil", "OCM", "Stonefoil"];
// Set list is hardcoded here — these are the marketplace's known set codes,
// kept in sync with sync.ts WOTF_SETS. New sets need entries in both places.
const WOTF_SETS = [
  { code: "EX1", label: "Existence" },
  { code: "CotS", label: "Call of the Stones" },
];
const SORTS = [
  { value: "cardNumber", label: "Card #" },
  { value: "name", label: "Name" },
  { value: "rarity", label: "Rarity" },
  { value: "price-low", label: "Price · Low → High" },
  { value: "price-high", label: "Price · High → Low" },
];

/**
 * Filter sidebar. All values mirror to URL ?params so links and refreshes
 * are shareable. Search is a controlled form: enter to submit, x to clear.
 * Selects are native <select> styled to match the warm-backroom aesthetic
 * — shadcn's Select primitive is heavier than this needs to be.
 */
export function SearchFilters() {
  const searchParams = useSearchParams();

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value && value !== "all") params.set(key, value);
      else params.delete(key);
      params.delete("page"); // reset pagination when a filter changes
      // Plain location nav: full page load, no Next.js Router Cache involved.
      // The earlier router.push / router.replace / startTransition variants
      // didn't reliably re-fetch the server component on search-param-only
      // changes in Next 16. This is unambiguous: the browser navigates, the
      // server renders fresh.
      const qs = params.toString();
      if (typeof window !== "undefined") {
        window.location.href = qs ? `/browse?${qs}` : "/browse";
      }
    },
    [searchParams],
  );

  const clearAll = useCallback(() => {
    if (typeof window !== "undefined") window.location.href = "/browse";
  }, []);

  // Local state for the search input so typing feels responsive without
  // pushing the URL on every keystroke. Submit on Enter; clear with the x.
  // Initialized once from the URL — thereafter the input owns its state.
  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");

  const submitSearch = useCallback(
    (next: string) => {
      const trimmed = next.trim();
      const current = searchParams.get("q") ?? "";
      if (trimmed === current) return;
      setParam("q", trimmed.length > 0 ? trimmed : null);
    },
    [setParam, searchParams],
  );

  return (
    <div className="space-y-5 font-mono text-[12px]">
      <FieldGroup label="Search">
        <form
          onSubmit={(e) => { e.preventDefault(); submitSearch(query); }}
          className="relative"
        >
          <input
            type="search"
            value={query}
            placeholder="Card name…"
            onChange={(e) => setQuery(e.target.value)}
            className="w-full h-9 pl-2 pr-7 rounded-md border border-border/60 bg-surface-base text-ink-primary text-[13px] placeholder:text-ink-muted focus-visible:outline-none focus-visible:border-gold/60"
          />
          {query && (
            <button
              type="button"
              onClick={() => { setQuery(""); submitSearch(""); }}
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center text-ink-muted hover:text-ink-primary"
            >
              ×
            </button>
          )}
        </form>
      </FieldGroup>

      <FieldGroup label="Sort">
        <SelectField
          value={searchParams.get("sort") ?? "cardNumber"}
          onChange={(v) => setParam("sort", v === "cardNumber" ? null : v)}
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </SelectField>
      </FieldGroup>

      <FieldGroup label="Game">
        <SelectField
          value={searchParams.get("game") ?? "all"}
          onChange={(v) => setParam("game", v)}
        >
          <option value="all">All games</option>
          <option value="wotf">Wonders of the First</option>
          <option value="boba">Bo Jackson Battle Arena</option>
        </SelectField>
      </FieldGroup>

      <FieldGroup label="Set">
        <SelectField
          value={searchParams.get("set") ?? "all"}
          onChange={(v) => setParam("set", v)}
        >
          <option value="all">All sets</option>
          {WOTF_SETS.map((s) => (
            <option key={s.code} value={s.code}>{s.label}</option>
          ))}
        </SelectField>
      </FieldGroup>

      <FieldGroup label="Orbital">
        <SelectField
          value={searchParams.get("orbital") ?? "all"}
          onChange={(v) => setParam("orbital", v)}
        >
          <option value="all">All orbitals</option>
          {ORBITALS.map((o) => <option key={o} value={o}>{o}</option>)}
        </SelectField>
      </FieldGroup>

      <FieldGroup label="Rarity">
        <SelectField
          value={searchParams.get("rarity") ?? "all"}
          onChange={(v) => setParam("rarity", v)}
        >
          <option value="all">All rarities</option>
          {RARITIES.map((r) => <option key={r} value={r}>{r}</option>)}
        </SelectField>
      </FieldGroup>

      <FieldGroup label="Type">
        <SelectField
          value={searchParams.get("cardType") ?? "all"}
          onChange={(v) => setParam("cardType", v)}
        >
          <option value="all">All types</option>
          {CARD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </SelectField>
      </FieldGroup>

      <FieldGroup label="Treatment">
        <SelectField
          value={searchParams.get("treatment") ?? "Classic Paper"}
          onChange={(v) => setParam("treatment", v === "Classic Paper" ? null : v)}
        >
          {TREATMENTS.map((t) => <option key={t} value={t}>{t}</option>)}
        </SelectField>
      </FieldGroup>

      <button
        type="button"
        onClick={clearAll}
        className="w-full mt-2 py-2 rounded border border-border/60 text-[10px] uppercase tracking-[0.12em] text-ink-secondary hover:text-ink-primary hover:border-gold/60 transition-colors"
      >
        Clear filters
      </button>
    </div>
  );
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.12em] text-ink-muted mb-1.5">{label}</p>
      {children}
    </div>
  );
}

function SelectField({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full h-9 px-2 rounded-md border border-border/60 bg-surface-base text-ink-primary text-[12px] focus-visible:outline-none focus-visible:border-gold/60 cursor-pointer"
    >
      {children}
    </select>
  );
}
