-- Widen trend7d and trend30d from Decimal(5,2) to Decimal(8,2).
--
-- The previous width capped trend percentages at +/-999.99%. Real CCG hype
-- cycles can move a card 10x+ in a week, and even routine outliers in noisy
-- price data push trends past 1000%. When the upsert hit overflow it rolled
-- back the entire CardMarketValue row, leaving stale market values on cards
-- whose data was just refreshed.
ALTER TABLE "CardMarketValue"
  ALTER COLUMN "trend7d"  TYPE DECIMAL(8, 2),
  ALTER COLUMN "trend30d" TYPE DECIMAL(8, 2);
