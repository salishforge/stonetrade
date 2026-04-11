/**
 * Compute a confidence score (0-100) for a card's market value.
 *
 * Factors:
 * - Number of data points (more = higher)
 * - Recency of most recent data point (newer = higher)
 * - Source diversity (more source types = higher)
 * - Agreement between sources (lower variance = higher)
 */
export function computeConfidence(params: {
  totalDataPoints: number;
  sourceCounts: Record<string, number>;
  mostRecentDate: Date | null;
  priceVariance: number; // coefficient of variation (stddev/mean)
}): number {
  const { totalDataPoints, sourceCounts, mostRecentDate, priceVariance } = params;

  if (totalDataPoints === 0) return 0;

  // Volume score (0-40): logarithmic scale, max at ~50 data points
  const volumeScore = Math.min(40, Math.log2(totalDataPoints + 1) * 7);

  // Recency score (0-25): full points if <7 days old, decays to 0 at 90+ days
  let recencyScore = 0;
  if (mostRecentDate) {
    const ageDays = (Date.now() - mostRecentDate.getTime()) / (1000 * 60 * 60 * 24);
    recencyScore = Math.max(0, 25 * (1 - ageDays / 90));
  }

  // Diversity score (0-20): more unique source types = higher
  const sourceTypes = Object.keys(sourceCounts).length;
  const diversityScore = Math.min(20, sourceTypes * 5);

  // Agreement score (0-15): lower coefficient of variation = higher
  let agreementScore = 15;
  if (priceVariance > 0) {
    // CV > 0.5 means high disagreement
    agreementScore = Math.max(0, 15 * (1 - Math.min(priceVariance, 1)));
  }

  return Math.round(volumeScore + recencyScore + diversityScore + agreementScore);
}
