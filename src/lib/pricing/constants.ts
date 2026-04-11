/** Weight constants for the composite market value algorithm */
export const PRICE_WEIGHTS: Record<string, number> = {
  COMPLETED_SALE: 0.40,
  BUYLIST_OFFER: 0.20,
  SELLER_LISTING: 0.15,
  COMMUNITY_POLL: 0.10,
  EBAY_SOLD: 0.10,
  MANUAL_REPORT: 0.05,
};

/** Time decay half-life in days */
export const DECAY_HALF_LIFE_DAYS = 30;

/** Minimum data points to compute a value */
export const MIN_DATA_POINTS = 1;

/** Outlier rejection: prices beyond this many std deviations are excluded */
export const OUTLIER_STD_DEVS = 3;
