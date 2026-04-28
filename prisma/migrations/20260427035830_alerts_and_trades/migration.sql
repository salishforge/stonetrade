-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('PRICE_DROP', 'PRICE_SPIKE', 'BACK_IN_STOCK', 'META_SHIFT');

-- CreateEnum
CREATE TYPE "TradeStatus" AS ENUM ('PROPOSED', 'ACCEPTED', 'DECLINED', 'WITHDRAWN', 'COMPLETED', 'CANCELLED');

-- CreateTable: alert subscriptions
CREATE TABLE "UserAlert" (
    "id"            TEXT NOT NULL,
    "userId"        TEXT NOT NULL,
    "type"          "AlertType" NOT NULL,
    "cardId"        TEXT,
    "thresholdPct"  DECIMAL(5,2),
    "active"        BOOLEAN NOT NULL DEFAULT true,
    "lastFiredAt"   TIMESTAMP(3),
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserAlert_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "UserAlert_userId_active_idx" ON "UserAlert"("userId", "active");
CREATE INDEX "UserAlert_cardId_type_idx" ON "UserAlert"("cardId", "type");

ALTER TABLE "UserAlert" ADD CONSTRAINT "UserAlert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UserAlert" ADD CONSTRAINT "UserAlert_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: trades (proposer offers items, recipient may accept/counter)
CREATE TABLE "Trade" (
    "id"             TEXT NOT NULL,
    "proposerId"     TEXT NOT NULL,
    "recipientId"    TEXT NOT NULL,
    "status"         "TradeStatus" NOT NULL DEFAULT 'PROPOSED',
    "cashAdjustment" DECIMAL(10,2),
    "message"        TEXT,
    "expiresAt"      TIMESTAMP(3) NOT NULL,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt"    TIMESTAMP(3),
    "completedAt"    TIMESTAMP(3),
    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Trade_proposerId_idx" ON "Trade"("proposerId");
CREATE INDEX "Trade_recipientId_idx" ON "Trade"("recipientId");
CREATE INDEX "Trade_status_idx" ON "Trade"("status");

ALTER TABLE "Trade" ADD CONSTRAINT "Trade_proposerId_fkey" FOREIGN KEY ("proposerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: items in a trade
CREATE TABLE "TradeItem" (
    "id"           TEXT NOT NULL,
    "tradeId"      TEXT NOT NULL,
    "cardId"       TEXT NOT NULL,
    "fromProposer" BOOLEAN NOT NULL,
    "quantity"     INTEGER NOT NULL DEFAULT 1,
    "condition"    "CardCondition" NOT NULL DEFAULT 'NEAR_MINT',
    "treatment"    TEXT NOT NULL,
    CONSTRAINT "TradeItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TradeItem_tradeId_idx" ON "TradeItem"("tradeId");

ALTER TABLE "TradeItem" ADD CONSTRAINT "TradeItem_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TradeItem" ADD CONSTRAINT "TradeItem_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
