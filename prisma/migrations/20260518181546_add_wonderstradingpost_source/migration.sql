-- AlterEnum
ALTER TYPE "PriceSource" ADD VALUE 'WONDERSTRADINGPOST';

-- AlterTable
ALTER TABLE "PriceDataPoint" ADD COLUMN "wonderstradingpostListingId" TEXT;
