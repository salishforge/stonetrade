import { cn } from "@/lib/utils";

interface PriceStackProps {
  marketLow?: unknown;
  marketMid?: unknown;
  marketHigh?: unknown;
  confidence?: number | null;
  trend7d?: unknown;
  scarcityTier?: string | null;
  volatilityTier?: string | null;
  /** Display layout. "compact" stacks key + value on one row; "expanded" prints labels above values. */
  variant?: "compact" | "expanded";
  className?: string;
}

function fmtPrice(value: unknown): string {
  if (value === null || value === undefined) return "—";
  const num = typeof value === "string" ? parseFloat(value) : Number(value);
  if (!Number.isFinite(num)) return "—";
  return `$${num.toFixed(2)}`;
}

function fmtTrend(value: unknown): { text: string; tone: "up" | "down" | "flat" } {
  if (value === null || value === undefined) return { text: "—", tone: "flat" };
  const num = typeof value === "string" ? parseFloat(value) : Number(value);
  if (!Number.isFinite(num)) return { text: "—", tone: "flat" };
  if (num > 0) return { text: `+${num.toFixed(2)}%`, tone: "up" };
  if (num < 0) return { text: `${num.toFixed(2)}%`, tone: "down" };
  return { text: "0.00%", tone: "flat" };
}

function tierColor(tier: string | null | undefined, scale: "scarcity" | "volatility"): string {
  if (!tier) return "text-ink-muted";
  if (scale === "scarcity") {
    return {
      abundant: "text-ink-secondary",
      available: "text-ink-secondary",
      scarce: "text-gold",
      acute: "text-crimson-light",
    }[tier] ?? "text-ink-muted";
  }
  return {
    stable: "text-ink-secondary",
    moderate: "text-ink-secondary",
    volatile: "text-gold",
    extreme: "text-crimson-light",
  }[tier] ?? "text-ink-muted";
}

/**
 * PriceStack — the dealer's price tag.
 *
 * Surfaces every signal the marketplace knows about a card in tight tabular
 * mono. The numbers are the product. No accordion, no "show details" — if
 * we have it, it's on screen. Bloomberg Terminal density per design doctrine §3.
 */
export function PriceStack({
  marketLow,
  marketMid,
  marketHigh,
  confidence,
  trend7d,
  scarcityTier,
  volatilityTier,
  variant = "compact",
  className,
}: PriceStackProps) {
  const trend = fmtTrend(trend7d);
  const trendClass =
    trend.tone === "up"
      ? "text-signal-legal"
      : trend.tone === "down"
        ? "text-crimson-light"
        : "text-ink-muted";
  const noData =
    marketMid === null || marketMid === undefined;

  if (noData) {
    return (
      <div className={cn("font-mono text-[11px] text-ink-muted uppercase tracking-[0.08em]", className)}>
        No price data
      </div>
    );
  }

  if (variant === "expanded") {
    return (
      <div className={cn("font-mono text-[12px] leading-tight space-y-1.5", className)}>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-ink-secondary uppercase tracking-[0.08em] text-[10px]">Mid</span>
          <span className="text-ink-primary text-[16px] font-medium tabular-nums">{fmtPrice(marketMid)}</span>
        </div>
        <div className="flex items-baseline justify-between gap-3 text-ink-secondary tabular-nums">
          <span>Low</span><span>{fmtPrice(marketLow)}</span>
        </div>
        <div className="flex items-baseline justify-between gap-3 text-ink-secondary tabular-nums">
          <span>High</span><span>{fmtPrice(marketHigh)}</span>
        </div>
        <div className="flex items-baseline justify-between gap-3 tabular-nums">
          <span className="text-ink-secondary">7d</span>
          <span className={trendClass}>{trend.text}</span>
        </div>
        <div className="flex items-baseline justify-between gap-3 text-ink-muted tabular-nums">
          <span>Conf</span>
          <span>{confidence != null ? `${confidence}%` : "—"}</span>
        </div>
        {(scarcityTier || volatilityTier) && (
          <div className="flex items-center gap-2 pt-1 mt-1 border-t border-border/40 uppercase tracking-[0.1em] text-[10px]">
            {scarcityTier && <span className={tierColor(scarcityTier, "scarcity")}>{scarcityTier}</span>}
            {scarcityTier && volatilityTier && <span className="text-ink-muted">·</span>}
            {volatilityTier && <span className={tierColor(volatilityTier, "volatility")}>{volatilityTier}</span>}
          </div>
        )}
      </div>
    );
  }

  // compact — single row of mid, trend, and a tier badge
  return (
    <div className={cn("font-mono text-[12px] flex items-baseline gap-2 tabular-nums", className)}>
      <span className="text-ink-primary text-[14px] font-medium">{fmtPrice(marketMid)}</span>
      {trend7d != null && <span className={cn("text-[11px]", trendClass)}>{trend.text}</span>}
      {scarcityTier && (
        <span className={cn("ml-auto uppercase tracking-[0.08em] text-[10px]", tierColor(scarcityTier, "scarcity"))}>
          {scarcityTier}
        </span>
      )}
    </div>
  );
}
