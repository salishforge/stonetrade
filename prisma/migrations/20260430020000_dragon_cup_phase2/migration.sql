-- Phase 2: Hunting Packs + Pack Contracts + Dragon Rider FK on DragonRegistration.
--
-- NOTE: prisma migrate diff also emitted a DropIndex on Card_searchVector_idx
-- and an ALTER COLUMN ... DROP DEFAULT against searchVector. Both are spurious
-- and would fail because searchVector is a Postgres GENERATED column populated
-- by the original card_search_vector migration. They are intentionally
-- removed below.
-- CreateEnum
CREATE TYPE "HuntingPackStatus" AS ENUM ('ACTIVE', 'DISBANDED');

-- CreateEnum
CREATE TYPE "PackMemberRole" AS ENUM ('FOUNDER', 'MEMBER');

-- CreateEnum
CREATE TYPE "PackInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'RATIFIED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "ContractPayoutMode" AS ENUM ('MANUAL', 'PROPORTIONAL_BY_SCALES');

-- CreateEnum
CREATE TYPE "RiderPaymentMode" AS ENUM ('FIXED_AMOUNT', 'PERCENT');

-- CreateEnum
CREATE TYPE "ContractSignatoryRole" AS ENUM ('PACK_MEMBER', 'DRAGON_RIDER');

-- CreateEnum
CREATE TYPE "ContractAuditAction" AS ENUM ('PACK_CREATED', 'CONTRACT_DRAFTED', 'VERSION_PROPOSED', 'SIGNED', 'DECLINED', 'RATIFIED', 'SUPERSEDED', 'RIDER_APPOINTED', 'RIDER_CHANGED', 'MEMBER_JOINED', 'MEMBER_LEFT', 'INVITATION_SENT', 'INVITATION_ACCEPTED', 'INVITATION_DECLINED');



ALTER TABLE "DragonRegistration" ADD COLUMN     "dragonRiderUserId" TEXT;

-- CreateTable
CREATE TABLE "HuntingPack" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "founderId" TEXT NOT NULL,
    "status" "HuntingPackStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HuntingPack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HuntingPackMember" (
    "id" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "PackMemberRole" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "HuntingPackMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackInvitation" (
    "id" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "inviterUserId" TEXT NOT NULL,
    "inviteeEmail" TEXT NOT NULL,
    "inviteeUserId" TEXT,
    "token" TEXT NOT NULL,
    "status" "PackInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "PackInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackContract" (
    "id" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "status" "ContractStatus" NOT NULL DEFAULT 'DRAFT',
    "currentVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PackContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractVersion" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "bodyJson" JSONB NOT NULL,
    "bodyHash" TEXT NOT NULL,
    "payoutMode" "ContractPayoutMode" NOT NULL,
    "riderPaymentMode" "RiderPaymentMode" NOT NULL,
    "riderPaymentValue" DECIMAL(12,2) NOT NULL,
    "dragonRiderUserId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ratifiedAt" TIMESTAMP(3),

    CONSTRAINT "ContractVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractSignatory" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ContractSignatoryRole" NOT NULL,
    "requiredForRatification" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ContractSignatory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractSignature" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "signatoryId" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signedBodyHash" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "ContractSignature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractAuditLog" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "versionId" TEXT,
    "actorUserId" TEXT,
    "action" "ContractAuditAction" NOT NULL,
    "payloadJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HuntingPack_slug_key" ON "HuntingPack"("slug");

-- CreateIndex
CREATE INDEX "HuntingPack_founderId_idx" ON "HuntingPack"("founderId");

-- CreateIndex
CREATE INDEX "HuntingPack_status_idx" ON "HuntingPack"("status");

-- CreateIndex
CREATE INDEX "HuntingPackMember_packId_leftAt_idx" ON "HuntingPackMember"("packId", "leftAt");

-- CreateIndex
CREATE INDEX "HuntingPackMember_userId_leftAt_idx" ON "HuntingPackMember"("userId", "leftAt");

-- CreateIndex
CREATE UNIQUE INDEX "PackInvitation_token_key" ON "PackInvitation"("token");

-- CreateIndex
CREATE INDEX "PackInvitation_packId_status_idx" ON "PackInvitation"("packId", "status");

-- CreateIndex
CREATE INDEX "PackInvitation_inviteeEmail_status_idx" ON "PackInvitation"("inviteeEmail", "status");

-- CreateIndex
CREATE INDEX "PackInvitation_inviteeUserId_status_idx" ON "PackInvitation"("inviteeUserId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PackContract_packId_key" ON "PackContract"("packId");

-- CreateIndex
CREATE UNIQUE INDEX "PackContract_currentVersionId_key" ON "PackContract"("currentVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "ContractVersion_contractId_versionNumber_key" ON "ContractVersion"("contractId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ContractSignatory_versionId_userId_role_key" ON "ContractSignatory"("versionId", "userId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "ContractSignature_signatoryId_key" ON "ContractSignature"("signatoryId");

-- CreateIndex
CREATE INDEX "ContractAuditLog_contractId_createdAt_idx" ON "ContractAuditLog"("contractId", "createdAt");

-- CreateIndex
CREATE INDEX "DragonRegistration_dragonRiderUserId_idx" ON "DragonRegistration"("dragonRiderUserId");

-- CreateIndex
CREATE UNIQUE INDEX "DragonRegistration_ownerType_packOwnerId_key" ON "DragonRegistration"("ownerType", "packOwnerId");

-- AddForeignKey
ALTER TABLE "DragonRegistration" ADD CONSTRAINT "DragonRegistration_dragonRiderUserId_fkey" FOREIGN KEY ("dragonRiderUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DragonRegistration" ADD CONSTRAINT "DragonRegistration_packOwnerId_fkey" FOREIGN KEY ("packOwnerId") REFERENCES "HuntingPack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HuntingPack" ADD CONSTRAINT "HuntingPack_founderId_fkey" FOREIGN KEY ("founderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HuntingPackMember" ADD CONSTRAINT "HuntingPackMember_packId_fkey" FOREIGN KEY ("packId") REFERENCES "HuntingPack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HuntingPackMember" ADD CONSTRAINT "HuntingPackMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackInvitation" ADD CONSTRAINT "PackInvitation_packId_fkey" FOREIGN KEY ("packId") REFERENCES "HuntingPack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackInvitation" ADD CONSTRAINT "PackInvitation_inviterUserId_fkey" FOREIGN KEY ("inviterUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackInvitation" ADD CONSTRAINT "PackInvitation_inviteeUserId_fkey" FOREIGN KEY ("inviteeUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackContract" ADD CONSTRAINT "PackContract_packId_fkey" FOREIGN KEY ("packId") REFERENCES "HuntingPack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackContract" ADD CONSTRAINT "PackContract_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "ContractVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractVersion" ADD CONSTRAINT "ContractVersion_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "PackContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractVersion" ADD CONSTRAINT "ContractVersion_dragonRiderUserId_fkey" FOREIGN KEY ("dragonRiderUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractVersion" ADD CONSTRAINT "ContractVersion_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractSignatory" ADD CONSTRAINT "ContractSignatory_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ContractVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractSignatory" ADD CONSTRAINT "ContractSignatory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractSignature" ADD CONSTRAINT "ContractSignature_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ContractVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractSignature" ADD CONSTRAINT "ContractSignature_signatoryId_fkey" FOREIGN KEY ("signatoryId") REFERENCES "ContractSignatory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractAuditLog" ADD CONSTRAINT "ContractAuditLog_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "PackContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractAuditLog" ADD CONSTRAINT "ContractAuditLog_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ContractVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractAuditLog" ADD CONSTRAINT "ContractAuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

