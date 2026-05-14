-- AlterEnum: PRICECHARTING label was applied in a prior attempt; guard against re-run.
ALTER TYPE "PriceSource" ADD VALUE IF NOT EXISTS 'PRICECHARTING';

-- AlterTable: add pricechartingId to Card
ALTER TABLE "Card" ADD COLUMN IF NOT EXISTS "pricechartingId" TEXT;

-- AlterTable: add pricechartingProductId to PriceDataPoint
ALTER TABLE "PriceDataPoint" ADD COLUMN IF NOT EXISTS "pricechartingProductId" TEXT;
