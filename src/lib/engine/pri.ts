import { PRI_WEIGHTS } from "@/lib/pricing/constants";

export interface PRIInputs {
  dbsScore: number | null;
  deckInclusionPct: number | null;
  winRateWhenIncluded: number | null;
  avgCopiesPlayed: number | null;
  replacementRate: number | null;
}

export interface PRIResult {
  pri: number;
  confidence: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function computePRI(inputs: PRIInputs): PRIResult {
  const axes: Array<{ score: number | null; weight: number }> = [
    {
      score: inputs.deckInclusionPct === null ? null : clamp(inputs.deckInclusionPct, 0, 100),
      weight: PRI_WEIGHTS.DECK_INCLUSION,
    },
    {
      score: inputs.winRateWhenIncluded === null ? null : clamp(inputs.winRateWhenIncluded, 0, 100),
      weight: PRI_WEIGHTS.WIN_RATE,
    },
    {
      score: inputs.dbsScore === null ? null : clamp(inputs.dbsScore, 0, 100),
      weight: PRI_WEIGHTS.DBS_SCORE,
    },
    {
      // 4 copies = full max for typical CCG.
      score: inputs.avgCopiesPlayed === null ? null : clamp((inputs.avgCopiesPlayed / 4) * 100, 0, 100),
      weight: PRI_WEIGHTS.AVG_COPIES,
    },
    {
      // Inverse: high replacement rate = low PRI contribution.
      score: inputs.replacementRate === null ? null : clamp(100 - inputs.replacementRate, 0, 100),
      weight: PRI_WEIGHTS.REPLACEMENT_RATE,
    },
  ];

  const present = axes.filter((axis) => axis.score !== null) as Array<{ score: number; weight: number }>;
  if (present.length === 0) {
    return { pri: 0, confidence: 0 };
  }

  const weightedSum = present.reduce((sum, axis) => sum + axis.score * axis.weight, 0);
  const totalWeight = present.reduce((sum, axis) => sum + axis.weight, 0);

  return {
    pri: Math.round(weightedSum / totalWeight),
    confidence: Math.round((present.length / axes.length) * 100),
  };
}
