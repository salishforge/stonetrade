/** Weight constants for the composite market value algorithm */
export const PRICE_WEIGHTS: Record<string, number> = {
  COMPLETED_SALE: 0.40,
  BUYLIST_OFFER: 0.20,
  SELLER_LISTING: 0.15,
  COMMUNITY_POLL: 0.10,
  EBAY_SOLD: 0.10,
  // eBay active listings are asking prices, not transactions — they
  // anchor the high end without overpowering real sales data.
  EBAY_LISTED: 0.05,
  MANUAL_REPORT: 0.05,
};

/** Time decay half-life in days */
export const DECAY_HALF_LIFE_DAYS = 30;

/** Minimum data points to compute a value */
export const MIN_DATA_POINTS = 1;

/** Outlier rejection: prices beyond this many std deviations are excluded */
export const OUTLIER_STD_DEVS = 3;

/** Below this transactional-data-point count, the composite degrades to an engine-prior estimate. */
export const MIN_DATA_POINTS_FOR_TRANSACTIONAL = 3;

/** PRI band width (±) for selecting comparable cards in the engine-prior lookup. */
export const ENGINE_PRIOR_PRI_BAND = 10;

/** Minimum comparable cards required to emit an engine-prior estimate. */
export const ENGINE_PRIOR_MIN_COMPARABLES = 3;

/** Weights for the Power Rating Index (PRI) composite. */
export const PRI_WEIGHTS = {
  DECK_INCLUSION:   0.35,
  WIN_RATE:         0.25,
  DBS_SCORE:        0.20,
  AVG_COPIES:       0.10,
  REPLACEMENT_RATE: 0.10,
} as const;

/**
 * Volatility tier thresholds keyed on coefficient of variation (stddev / mean)
 * over the last 30 days. Lower CV = more stable. Per PLANNING.md §5.1.
 */
export const VOLATILITY_TIERS = {
  STABLE:   0.10,
  MODERATE: 0.25,
  VOLATILE: 0.50,
  // EXTREME catches CV > VOLATILE
} as const;

/** Minimum data points needed to publish a volatility tier. Below this, tier is null. */
export const VOLATILITY_MIN_POINTS = 3;

/**
 * Scarcity tier thresholds keyed on scarcity ratio = totalWanted / max(totalAvailable, 1).
 * Higher ratio = scarcer. PLANNING.md §6.1 mentions ratio >= 3 as the engine-prior
 * upper-band trigger ("acute"); the in-between tiers are calibration choices.
 */
export const SCARCITY_TIERS = {
  ABUNDANT:  0.5,  // ratio < 0.5 → lots of supply for the demand
  AVAILABLE: 1.5,  // 0.5–1.5 → rough parity
  SCARCE:    3.0,  // 1.5–3.0 → meaningfully more demand than supply
  // ACUTE catches ratio >= SCARCE
} as const;
