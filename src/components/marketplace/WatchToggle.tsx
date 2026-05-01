"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface ExistingAlert {
  id: string;
  type: "PRICE_DROP" | "PRICE_SPIKE" | "BACK_IN_STOCK" | "META_SHIFT";
  thresholdPct: string | null;
}

interface WatchToggleProps {
  cardId: string;
  /** Alerts the current user has already created on this card. */
  existing: ExistingAlert[];
}

interface WatchOption {
  type: "PRICE_SPIKE" | "PRICE_DROP" | "BACK_IN_STOCK" | "META_SHIFT";
  label: string;
  hint: string;
  /** Default threshold (%) for PRICE_DROP / PRICE_SPIKE; null otherwise. */
  defaultThreshold: number | null;
}

const OPTIONS: WatchOption[] = [
  { type: "PRICE_SPIKE", label: "Price spike", hint: "≥10% in 7d", defaultThreshold: 10 },
  { type: "PRICE_DROP", label: "Price drop", hint: "≥10% in 7d", defaultThreshold: 10 },
  { type: "BACK_IN_STOCK", label: "Back in stock", hint: "any seller lists it", defaultThreshold: null },
  { type: "META_SHIFT", label: "Meta shift", hint: "PRI moves ≥10", defaultThreshold: null },
];

/**
 * WatchToggle — per-card alert subscription affordance.
 *
 * Renders the four alert types as a column of toggles. Each toggle reflects
 * whether the user already has that alert active on this card; clicking
 * creates or deletes the alert via the existing /api/alerts surface.
 *
 * Optimistic UI: we flip the local state immediately and revert on error.
 * Server data is refreshed via router.refresh() so the page's existing
 * server-side `existing` prop stays the source of truth on next render.
 */
export function WatchToggle({ cardId, existing }: WatchToggleProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Local mirror of "what alerts exist for this card" — keyed by alert type.
  const [active, setActive] = useState<Map<string, ExistingAlert>>(
    () => new Map(existing.map((a) => [a.type, a])),
  );
  const [error, setError] = useState<string | null>(null);

  async function toggle(opt: WatchOption) {
    setError(null);
    const current = active.get(opt.type);

    if (current) {
      // Optimistic remove
      const next = new Map(active);
      next.delete(opt.type);
      setActive(next);
      try {
        const res = await fetch(`/api/alerts/${current.id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("delete failed");
        startTransition(() => router.refresh());
      } catch {
        setActive(active); // revert
        setError("Couldn't remove that alert. Try again.");
      }
      return;
    }

    // Optimistic add — we don't know the new id yet; use a placeholder so the
    // toggle reads as "on", then router.refresh() pulls real data back.
    const placeholder: ExistingAlert = {
      id: `pending-${opt.type}`,
      type: opt.type,
      thresholdPct: opt.defaultThreshold != null ? String(opt.defaultThreshold) : null,
    };
    const next = new Map(active);
    next.set(opt.type, placeholder);
    setActive(next);

    try {
      const body: Record<string, unknown> = { type: opt.type, cardId };
      if (opt.defaultThreshold != null) body.thresholdPct = opt.defaultThreshold;
      // META_SHIFT in the validator is account-wide (no cardId required) but
      // it accepts a cardId — we send it so the alert is scoped to this card.
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("create failed");
      startTransition(() => router.refresh());
    } catch {
      setActive(active); // revert
      setError("Couldn't create that alert. Try again.");
    }
  }

  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-muted mb-2">
        Watch this card
      </p>
      <ul className="border border-border/40 rounded-md overflow-hidden bg-surface-raised/40">
        {OPTIONS.map((opt, i) => {
          const isActive = active.has(opt.type);
          return (
            <li key={opt.type} className={i > 0 ? "border-t border-border/40" : ""}>
              <button
                type="button"
                onClick={() => toggle(opt)}
                disabled={pending}
                className={`w-full flex items-baseline justify-between gap-3 px-3 py-2 text-left transition-colors ${
                  isActive
                    ? "bg-gold-dark/25 text-gold-light"
                    : "text-ink-secondary hover:bg-surface-overlay/50 hover:text-ink-primary"
                } disabled:opacity-50`}
              >
                <span className="flex flex-col leading-tight">
                  <span className="text-[12px]">{opt.label}</span>
                  <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-ink-muted">
                    {opt.hint}
                  </span>
                </span>
                <span
                  aria-hidden
                  className={`font-mono text-[10px] tracking-[0.12em] uppercase ${
                    isActive ? "text-gold" : "text-ink-muted"
                  }`}
                >
                  {isActive ? "on" : "off"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {error && (
        <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.08em] text-crimson-light">
          {error}
        </p>
      )}
    </div>
  );
}
