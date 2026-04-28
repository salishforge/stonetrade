-- CreateTable: append-only PRI snapshots, used by alert evaluator for META_SHIFT
CREATE TABLE "CardEngineMetricsHistory" (
    "id"            TEXT NOT NULL,
    "cardId"        TEXT NOT NULL,
    "pri"           INTEGER NOT NULL,
    "priConfidence" INTEGER,
    "capturedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CardEngineMetricsHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CardEngineMetricsHistory_cardId_capturedAt_idx" ON "CardEngineMetricsHistory"("cardId", "capturedAt");

ALTER TABLE "CardEngineMetricsHistory" ADD CONSTRAINT "CardEngineMetricsHistory_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
