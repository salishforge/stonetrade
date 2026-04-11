"use client";

import { Badge } from "@/components/ui/badge";
import { CONFIDENCE_THRESHOLDS, type ConfidenceLevel } from "@/types/pricing";

function getConfidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence < CONFIDENCE_THRESHOLDS.INSUFFICIENT) return "insufficient";
  if (confidence < CONFIDENCE_THRESHOLDS.LOW) return "low";
  if (confidence < CONFIDENCE_THRESHOLDS.MODERATE) return "moderate";
  return "high";
}

const LEVEL_CONFIG: Record<ConfidenceLevel, { label: string; className: string }> = {
  insufficient: { label: "Insufficient Data", className: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
  low: { label: "Low Confidence", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" },
  moderate: { label: "Moderate", className: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  high: { label: "High Confidence", className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
};

export function ConfidenceBadge({ confidence }: { confidence: number }) {
  const level = getConfidenceLevel(confidence);
  const config = LEVEL_CONFIG[level];

  return (
    <Badge className={config.className} variant="secondary">
      {config.label}
    </Badge>
  );
}
