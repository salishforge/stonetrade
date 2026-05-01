/**
 * Card movement attribution — "Why is this card moving?"
 *
 * Given a card's market signals over the last 7-14 days, picks the dominant
 * cause and returns a one-line headline plus supporting signal chips. This is
 * deterministic ranked attribution, not generative text — no LLM, no
 * "because of" phrasing for things that are correlations, no claims that
 * can't be derived from numbers we hold.
 *
 * The honest contract: we say what shifted, with magnitudes, in plain English.
 * Causation is implied via "Following X" wording when temporal correlation
 * is the strongest signal.
 *
 * This file is pure — no Prisma, no Date.now(). Every input is passed in.
 * That keeps the ranking testable and lets the page server-render the result.
 */

export interface AttributionInput {
  trend7d: number | null;
  scarcityTier: string | null;
  totalAvailable: number;
  totalWanted: number;
  priCurrent: number | null;
  /** PRI value from ≥7 days ago, if a snapshot exists. */
  priPrior: number | null;
  /** Count of completed/eBay sales in the trailing 7 days. */
  recentSales7d: number;
  /** Count of completed/eBay sales in the 7d preceding `recentSales7d`. */
  priorSales7d: number;
  /** Tournament events that have completed in the last 21 days. */
  recentTournaments: { name: string; eventDate: Date }[];
  /** "Now" — passed in for deterministic tests. */
  now: Date;
}

export type AttributionTone = "up" | "down" | "flat" | "supply" | "demand";

export interface AttributionSignal {
  /** Short SHOUT-CASE tag for chips, e.g. "ENGINE" or "SUPPLY". */
  label: string;
  /** Formatted change, e.g. "+18 PRI" or "2.4× sales". */
  value: string;
  /** 0..1 — how much this signal contributed to the headline. */
  weight: number;
}

export interface Attribution {
  headline: string;
  /** Drives color tone of the headline. */
  tone: AttributionTone;
  /** All meaningful signals, sorted strongest first. The headline reflects signals[0]. */
  signals: AttributionSignal[];
  /** True when no signal crossed the noise floor — render as a quiet "Quiet week" state. */
  quiet: boolean;
}

const PRI_DELTA_NOTABLE = 5;
const PRI_DELTA_LARGE = 10;
const TREND_NOTABLE_PCT = 5;
const TOURNAMENT_ECHO_DAYS = 14;
const SUPPLY_SHOCK_TIERS = new Set(["scarce", "acute"]);

function fmtSignedInt(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

function fmtSignedPct(n: number): string {
  const rounded = Math.abs(n) >= 10 ? Math.round(n) : Number(n.toFixed(1));
  return n > 0 ? `+${rounded}%` : `${rounded}%`;
}

function daysBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / 86_400_000;
}

/**
 * Rank candidate signals and produce a structured attribution. The headline
 * is keyed off the strongest signal; weaker signals become supporting chips.
 *
 * Ranking is intentionally simple (one number per signal). When two signals
 * tie, we prefer the one with the more concrete narrative — engine over
 * supply over sales — because that's what readers find most actionable.
 */
export function explainMovement(input: AttributionInput): Attribution {
  const signals: AttributionSignal[] = [];

  // ── Engine shift (PRI delta) ───────────────────────────────────────────
  let priDelta: number | null = null;
  if (input.priCurrent != null && input.priPrior != null) {
    priDelta = input.priCurrent - input.priPrior;
    if (Math.abs(priDelta) >= PRI_DELTA_NOTABLE) {
      signals.push({
        label: "ENGINE",
        value: `${fmtSignedInt(priDelta)} PRI`,
        weight: Math.min(1, Math.abs(priDelta) / 25),
      });
    }
  }

  // ── Tournament echo: a recent event + a same-direction PRI move ────────
  let tournamentEcho: { name: string; eventDate: Date; weight: number } | null = null;
  if (priDelta != null && Math.abs(priDelta) >= PRI_DELTA_NOTABLE) {
    const candidates = input.recentTournaments
      .filter((t) => daysBetween(t.eventDate, input.now) <= TOURNAMENT_ECHO_DAYS)
      .sort((a, b) => b.eventDate.getTime() - a.eventDate.getTime());
    if (candidates.length > 0) {
      const t = candidates[0];
      const ageDays = daysBetween(t.eventDate, input.now);
      const recencyWeight = 1 - ageDays / TOURNAMENT_ECHO_DAYS; // 1.0 fresh → 0 at 14d
      const weight = Math.min(1, (Math.abs(priDelta) / 20) * (0.5 + 0.5 * recencyWeight));
      tournamentEcho = { name: t.name, eventDate: t.eventDate, weight };
      signals.push({
        label: "TOURNAMENT",
        value: t.name,
        weight,
      });
    }
  }

  // ── Supply shock: scarce / acute tier ──────────────────────────────────
  if (input.scarcityTier && SUPPLY_SHOCK_TIERS.has(input.scarcityTier)) {
    const intensity = input.scarcityTier === "acute" ? 0.85 : 0.6;
    signals.push({
      label: "SUPPLY",
      value: `${input.totalAvailable} avail · ${input.totalWanted} want`,
      weight: intensity,
    });
  }

  // ── Sales surge: 7d sales notably above the prior 7d ───────────────────
  if (input.recentSales7d >= 3 && input.priorSales7d >= 1) {
    const ratio = input.recentSales7d / Math.max(1, input.priorSales7d);
    if (ratio >= 1.5 || ratio <= 0.5) {
      signals.push({
        label: "VOLUME",
        value: `${ratio.toFixed(1)}× sales`,
        weight: Math.min(1, Math.abs(Math.log2(ratio)) / 2),
      });
    }
  }

  // ── Bid pressure: way more wants than available ────────────────────────
  // Suppress when SUPPLY already fired — they narrate the same phenomenon and
  // SUPPLY's wording (scarcity tier) is more concrete.
  const supplyAlreadyFired = signals.some((s) => s.label === "SUPPLY");
  if (
    !supplyAlreadyFired &&
    input.totalWanted >= 3 &&
    input.totalWanted >= input.totalAvailable * 2
  ) {
    signals.push({
      label: "BIDS",
      value: `${input.totalWanted} wants`,
      weight: Math.min(1, input.totalWanted / Math.max(1, input.totalAvailable * 4)),
    });
  }

  signals.sort((a, b) => b.weight - a.weight);

  // ── Pick a tone ────────────────────────────────────────────────────────
  const trendNum = input.trend7d ?? 0;
  const noTrend = input.trend7d == null || Math.abs(trendNum) < TREND_NOTABLE_PCT;
  const noEngine = priDelta == null || Math.abs(priDelta) < PRI_DELTA_NOTABLE;

  if (noTrend && noEngine && signals.length === 0) {
    return {
      headline: "Quiet week. No notable signal in the last 7 days.",
      tone: "flat",
      signals: [],
      quiet: true,
    };
  }

  // ── Headline composition ───────────────────────────────────────────────
  const top = signals[0];

  // Tournament-correlated engine moves get the "Following X" wording whether
  // the engine signal or the tournament echo ranked higher — both are saying
  // the same thing, and the temporal narrative is what readers want.
  if (
    tournamentEcho &&
    priDelta != null &&
    Math.abs(priDelta) >= PRI_DELTA_LARGE &&
    (top?.label === "ENGINE" || top?.label === "TOURNAMENT")
  ) {
    const ageDays = Math.round(daysBetween(tournamentEcho.eventDate, input.now));
    return {
      headline: `Following ${tournamentEcho.name} ${ageDays}d ago — engine read shifted ${fmtSignedInt(priDelta)} PRI.`,
      tone: priDelta > 0 ? "up" : "down",
      signals,
      quiet: false,
    };
  }

  if (top?.label === "ENGINE" && priDelta != null) {
    const direction = priDelta > 0 ? "jumped" : "fell";
    const tail =
      priDelta > 0
        ? "deck inclusion shifted higher."
        : "falling out of meta lists.";
    return {
      headline: `Engine read ${direction} ${fmtSignedInt(priDelta)} PRI in 7d — ${tail}`,
      tone: priDelta > 0 ? "up" : "down",
      signals,
      quiet: false,
    };
  }

  if (top?.label === "SUPPLY") {
    return {
      headline: `Supply tightened to ${input.scarcityTier} — ${input.totalAvailable} available against ${input.totalWanted} wants.`,
      tone: "supply",
      signals,
      quiet: false,
    };
  }

  if (top?.label === "VOLUME") {
    const direction = input.recentSales7d > input.priorSales7d ? "up" : "down";
    const verb = direction === "up" ? "Sales accelerated" : "Sales cooled";
    return {
      headline: `${verb} — ${input.recentSales7d} trades in 7d vs ${input.priorSales7d} prior week.`,
      tone: direction === "up" ? "up" : "down",
      signals,
      quiet: false,
    };
  }

  if (top?.label === "BIDS") {
    return {
      headline: `Demand outweighs supply — ${input.totalWanted} wants against ${input.totalAvailable} available.`,
      tone: "demand",
      signals,
      quiet: false,
    };
  }

  // Fall-back: there's a price move but no clear cause we can attribute.
  if (!noTrend) {
    return {
      headline: `Price drifted ${fmtSignedPct(trendNum)} in 7d. No single dominant signal.`,
      tone: trendNum > 0 ? "up" : "down",
      signals,
      quiet: false,
    };
  }

  return {
    headline: "Quiet week. No notable signal in the last 7 days.",
    tone: "flat",
    signals: [],
    quiet: true,
  };
}
