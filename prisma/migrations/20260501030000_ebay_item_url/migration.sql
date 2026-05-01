-- Add ebayItemUrl to PriceDataPoint so the marketplace card pages can
-- surface "Find on eBay" deep-links to the originating listing.
ALTER TABLE "PriceDataPoint" ADD COLUMN "ebayItemUrl" TEXT;
