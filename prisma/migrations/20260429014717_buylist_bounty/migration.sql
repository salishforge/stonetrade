-- AlterTable: add bounty + auto-buy flags
ALTER TABLE "BuylistEntry"
  ADD COLUMN "isBounty"       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "bountyPostedAt" TIMESTAMP(3),
  ADD COLUMN "autoBuy"        BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "BuylistEntry_isBounty_bountyPostedAt_idx" ON "BuylistEntry"("isBounty", "bountyPostedAt");
CREATE INDEX "BuylistEntry_cardId_isBounty_idx" ON "BuylistEntry"("cardId", "isBounty");
