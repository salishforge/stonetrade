-- CreateEnum
CREATE TYPE "DragonScaleBonusVariant" AS ENUM ('NONE', 'AUTOGRAPH', 'ALT_ART', 'ECHO', 'PROMO', 'ART_PROOF_DIGITAL', 'PRE_RELEASE_FOIL');

-- CreateEnum
CREATE TYPE "DragonOwnerType" AS ENUM ('USER', 'PACK');

-- AlterTable
-- NOTE: The Prisma autogen also emitted a DropIndex on Card_searchVector_idx and an
-- ALTER COLUMN ... DROP DEFAULT against searchVector. Both are spurious and would
-- fail because searchVector is a Postgres GENERATED column populated by an earlier
-- migration. Keeping the additive ADD COLUMN clauses only.
ALTER TABLE "Card" ADD COLUMN     "isLoreMythic" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isStoneseeker" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isToken" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "DragonScale" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "collectionCardId" TEXT,
    "treatment" TEXT NOT NULL,
    "bonusVariant" "DragonScaleBonusVariant" NOT NULL DEFAULT 'NONE',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "serialNumber" TEXT,
    "pointsCached" INTEGER NOT NULL DEFAULT 0,
    "pointsCalculatedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DragonScale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DragonRegistration" (
    "id" TEXT NOT NULL,
    "ownerType" "DragonOwnerType" NOT NULL,
    "userOwnerId" TEXT,
    "packOwnerId" TEXT,
    "currentPoints" INTEGER NOT NULL,
    "formedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dissolvedAt" TIMESTAMP(3),
    "lastRecalculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DragonRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DragonScale_userId_idx" ON "DragonScale"("userId");

-- CreateIndex
CREATE INDEX "DragonScale_userId_pointsCached_idx" ON "DragonScale"("userId", "pointsCached");

-- CreateIndex
CREATE INDEX "DragonScale_cardId_idx" ON "DragonScale"("cardId");

-- CreateIndex
CREATE INDEX "DragonRegistration_currentPoints_idx" ON "DragonRegistration"("currentPoints");

-- CreateIndex
CREATE UNIQUE INDEX "DragonRegistration_ownerType_userOwnerId_key" ON "DragonRegistration"("ownerType", "userOwnerId");

-- AddForeignKey
ALTER TABLE "DragonScale" ADD CONSTRAINT "DragonScale_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DragonScale" ADD CONSTRAINT "DragonScale_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DragonScale" ADD CONSTRAINT "DragonScale_collectionCardId_fkey" FOREIGN KEY ("collectionCardId") REFERENCES "CollectionCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DragonRegistration" ADD CONSTRAINT "DragonRegistration_userOwnerId_fkey" FOREIGN KEY ("userOwnerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
