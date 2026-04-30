-- AlterTable: add volatility + scarcity indices to CardMarketValue
ALTER TABLE "CardMarketValue"
  ADD COLUMN "stdDev30d"      DECIMAL(10,2),
  ADD COLUMN "coeffVar30d"    DECIMAL(5,4),
  ADD COLUMN "volatilityTier" TEXT,
  ADD COLUMN "totalWanted"    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "totalAvailable" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "totalCollected" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "scarcityRatio"  DECIMAL(8,4),
  ADD COLUMN "scarcityTier"   TEXT;

-- CreateIndex
CREATE INDEX "CardMarketValue_volatilityTier_idx" ON "CardMarketValue"("volatilityTier");
CREATE INDEX "CardMarketValue_scarcityTier_idx" ON "CardMarketValue"("scarcityTier");
