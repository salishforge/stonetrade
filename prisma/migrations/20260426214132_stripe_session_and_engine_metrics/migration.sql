-- AlterTable: Stripe Checkout Session id for webhook lookup
ALTER TABLE "Order" ADD COLUMN "stripeCheckoutSessionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Order_stripeCheckoutSessionId_key" ON "Order"("stripeCheckoutSessionId");

-- CreateTable: per-card engine metrics for PRI computation
CREATE TABLE "CardEngineMetrics" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "dbsScore" INTEGER,
    "deckInclusionPct" DECIMAL(5,2),
    "winRateWhenIncluded" DECIMAL(5,2),
    "avgCopiesPlayed" DECIMAL(4,2),
    "replacementRate" DECIMAL(5,2),
    "pri" INTEGER,
    "priConfidence" INTEGER,
    "format" TEXT,
    "windowStart" TIMESTAMP(3),
    "windowEnd" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardEngineMetrics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CardEngineMetrics_cardId_key" ON "CardEngineMetrics"("cardId");

-- CreateIndex
CREATE INDEX "CardEngineMetrics_pri_idx" ON "CardEngineMetrics"("pri");

-- CreateIndex
CREATE INDEX "CardEngineMetrics_deckInclusionPct_idx" ON "CardEngineMetrics"("deckInclusionPct");

-- AddForeignKey
ALTER TABLE "CardEngineMetrics" ADD CONSTRAINT "CardEngineMetrics_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
