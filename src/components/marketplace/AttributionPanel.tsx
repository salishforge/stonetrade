import { cn } from "@/lib/utils";
import type { Attribution } from "@/lib/attribution/explain";

interface AttributionPanelProps {
  attribution: Attribution;
  className?: string;
}

const TONE_RAIL: Record<Attribution["tone"], string> = {
  up: "before:bg-signal-legal/70",
  down: "before:bg-crimson/70",
  flat: "before:bg-ink-muted/40",
  supply: "before:bg-gold/70",
  demand: "before:bg-gold-light/70",
};

const TONE_HEADLINE: Record<Attribution["tone"], string> = {
  up: "text-ink-primary",
  down: "text-ink-primary",
  flat: "text-ink-secondary",
  supply: "text-ink-primary",
  demand: "text-ink-primary",
};

/**
 * AttributionPanel — "Why is this card moving?"
 *
 * Renders the dominant attribution as a single declarative sentence with a
 * left-side tone rail, then surfaces the contributing signals as quiet
 * tabular chips. Stays low-chrome on purpose: this sits below the louder
 * Market Read panel and should feel like a footnote that earned its place,
 * not another box competing for attention.
 */
export function AttributionPanel({ attribution, className }: AttributionPanelProps) {
  const { headline, tone, signals, quiet } = attribution;

  return (
    <div
      className={cn(
        "relative pl-5",
        // Left rail — a single hairline of tone color, not a full border.
        "before:absolute before:left-0 before:top-1 before:bottom-1 before:w-px",
        TONE_RAIL[tone],
        className,
      )}
    >
      <div className="flex items-baseline gap-3 mb-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted">
          Read
        </span>
        {quiet && (
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-muted">
            quiet
          </span>
        )}
      </div>

      <p
        className={cn(
          "text-[15px] leading-snug tracking-[-0.005em]",
          TONE_HEADLINE[tone],
        )}
      >
        {headline}
      </p>

      {signals.length > 0 && (
        <ul className="flex flex-wrap gap-x-5 gap-y-1.5 mt-3 font-mono text-[11px] tabular-nums">
          {signals.map((s, i) => (
            <li key={i} className="flex items-baseline gap-1.5">
              <span className="text-[9px] uppercase tracking-[0.14em] text-ink-muted">
                {s.label}
              </span>
              <span className="text-ink-secondary">{s.value}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
