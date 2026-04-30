"use client";

import { useSearchParams } from "next/navigation";

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
 * Plain HTML <form method="get" action="/browse"> so filter changes are
 * regular browser navigations, not Next.js soft nav. This works even
 * without JavaScript; with JS, the form auto-submits when any field
 * changes for an instant-feel UX.
 *
 * Why not React Router state: Next 16's Router Cache served stale segments
 * for search-param-only navigation, neither push() / replace() / refresh()
 * / startTransition reliably invalidated it. A real browser navigation
 * sidesteps the entire problem.
 */
export function SearchFilters() {
  const searchParams = useSearchParams();

  // Auto-submit when any select changes. Find the parent form via DOM.
  function autoSubmit(e: React.ChangeEvent<HTMLSelectElement>) {
    e.currentTarget.form?.requestSubmit();
  }

  // Build "preserve other params" data attribute snapshots: when a select
  // holds value === "all", we don't want it serialized into the URL. We
  // strip empty/all-named entries by giving them no `name` attribute (a
  // form field without a name isn't submitted).
  const value = (key: string, fallback: string) => searchParams.get(key) ?? fallback;
  const treatmentValue = value("treatment", "Classic Paper");
  const sortValue = value("sort", "cardNumber");

  return (
    <form
      method="get"
      action="/browse"
      className="space-y-5 font-mono text-[12px]"
    >
      <FieldGroup label="Search">
        <div className="relative">
          <input
            type="search"
            name="q"
            defaultValue={searchParams.get("q") ?? ""}
            placeholder="Card name…"
            className="w-full h-9 pl-2 pr-7 rounded-md border border-border/60 bg-surface-base text-ink-primary text-[13px] placeholder:text-ink-muted focus-visible:outline-none focus-visible:border-gold/60"
          />
        </div>
      </FieldGroup>

      <FieldGroup label="Sort">
        <select
          name="sort"
          defaultValue={sortValue}
          onChange={autoSubmit}
          className="w-full h-9 px-2 rounded-md border border-border/60 bg-surface-base text-ink-primary text-[12px] focus-visible:outline-none focus-visible:border-gold/60 cursor-pointer"
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </FieldGroup>

      <FilterSelect label="Game" name="game" current={value("game", "all")} options={[
        { value: "all", label: "All games" },
        { value: "wotf", label: "Wonders of the First" },
        { value: "boba", label: "Bo Jackson Battle Arena" },
      ]} onChange={autoSubmit} />

      <FilterSelect label="Set" name="set" current={value("set", "all")} options={[
        { value: "all", label: "All sets" },
        ...WOTF_SETS.map((s) => ({ value: s.code, label: s.label })),
      ]} onChange={autoSubmit} />

      <FilterSelect label="Orbital" name="orbital" current={value("orbital", "all")} options={[
        { value: "all", label: "All orbitals" },
        ...ORBITALS.map((o) => ({ value: o, label: o })),
      ]} onChange={autoSubmit} />

      <FilterSelect label="Rarity" name="rarity" current={value("rarity", "all")} options={[
        { value: "all", label: "All rarities" },
        ...RARITIES.map((r) => ({ value: r, label: r })),
      ]} onChange={autoSubmit} />

      <FilterSelect label="Type" name="cardType" current={value("cardType", "all")} options={[
        { value: "all", label: "All types" },
        ...CARD_TYPES.map((t) => ({ value: t, label: t })),
      ]} onChange={autoSubmit} />

      <FieldGroup label="Treatment">
        <select
          name="treatment"
          defaultValue={treatmentValue}
          onChange={autoSubmit}
          className="w-full h-9 px-2 rounded-md border border-border/60 bg-surface-base text-ink-primary text-[12px] focus-visible:outline-none focus-visible:border-gold/60 cursor-pointer"
        >
          {TREATMENTS.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </FieldGroup>

      <button
        type="submit"
        className="w-full mt-2 py-2 rounded border border-gold/60 bg-gold-dark/30 text-[10px] uppercase tracking-[0.12em] text-gold-light hover:bg-gold-dark/50 transition-colors"
      >
        Apply filters
      </button>
      <a
        href="/browse"
        className="block text-center w-full py-2 rounded border border-border/60 text-[10px] uppercase tracking-[0.12em] text-ink-secondary hover:text-ink-primary hover:border-gold/60 transition-colors"
      >
        Clear filters
      </a>
    </form>
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

interface SelectOption {
  value: string;
  label: string;
}

function FilterSelect({
  label,
  name,
  current,
  options,
  onChange,
}: {
  label: string;
  name: string;
  current: string;
  options: SelectOption[];
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
}) {
  return (
    <FieldGroup label={label}>
      <select
        name={name}
        defaultValue={current}
        onChange={onChange}
        className="w-full h-9 px-2 rounded-md border border-border/60 bg-surface-base text-ink-primary text-[12px] focus-visible:outline-none focus-visible:border-gold/60 cursor-pointer"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </FieldGroup>
  );
}
