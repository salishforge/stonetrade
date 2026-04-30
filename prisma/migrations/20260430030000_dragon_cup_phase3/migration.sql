-- Phase 3: Tournament events.
--
-- NOTE: prisma migrate diff also emitted a DropIndex + ALTER COLUMN against
-- the searchVector generated column. Both are spurious and removed below.
-- CreateEnum
CREATE TYPE "TournamentEventStatus" AS ENUM ('UPCOMING', 'REGISTRATION_OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TournamentRegistrationStatus" AS ENUM ('REGISTERED', 'CHECKED_IN', 'WITHDRAWN', 'DISQUALIFIED', 'COMPLETED');



-- CreateTable
CREATE TABLE "TournamentEvent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "eventDate" TIMESTAMP(3) NOT NULL,
    "basePrizePool" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "dragonGoldPool" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "TournamentEventStatus" NOT NULL DEFAULT 'UPCOMING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TournamentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentRegistration" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "dragonRegistrationId" TEXT NOT NULL,
    "dragonRiderUserId" TEXT NOT NULL,
    "declaredPoints" INTEGER NOT NULL,
    "status" "TournamentRegistrationStatus" NOT NULL DEFAULT 'REGISTERED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawnAt" TIMESTAMP(3),

    CONSTRAINT "TournamentRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentResult" (
    "id" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "finishingPosition" INTEGER NOT NULL,
    "multiplier" DECIMAL(6,2) NOT NULL,
    "weightedPoints" INTEGER NOT NULL,
    "basePayoutCents" INTEGER NOT NULL DEFAULT 0,
    "dragonGoldPayoutCents" INTEGER NOT NULL DEFAULT 0,
    "paidOutAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TournamentResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TournamentEvent_slug_key" ON "TournamentEvent"("slug");

-- CreateIndex
CREATE INDEX "TournamentEvent_eventDate_idx" ON "TournamentEvent"("eventDate");

-- CreateIndex
CREATE INDEX "TournamentEvent_status_idx" ON "TournamentEvent"("status");

-- CreateIndex
CREATE INDEX "TournamentRegistration_eventId_status_idx" ON "TournamentRegistration"("eventId", "status");

-- CreateIndex
CREATE INDEX "TournamentRegistration_dragonRiderUserId_idx" ON "TournamentRegistration"("dragonRiderUserId");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentRegistration_eventId_dragonRegistrationId_key" ON "TournamentRegistration"("eventId", "dragonRegistrationId");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentRegistration_eventId_dragonRiderUserId_key" ON "TournamentRegistration"("eventId", "dragonRiderUserId");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentResult_registrationId_key" ON "TournamentResult"("registrationId");

-- CreateIndex
CREATE INDEX "TournamentResult_finishingPosition_idx" ON "TournamentResult"("finishingPosition");

-- AddForeignKey
ALTER TABLE "TournamentRegistration" ADD CONSTRAINT "TournamentRegistration_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "TournamentEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentRegistration" ADD CONSTRAINT "TournamentRegistration_dragonRegistrationId_fkey" FOREIGN KEY ("dragonRegistrationId") REFERENCES "DragonRegistration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentRegistration" ADD CONSTRAINT "TournamentRegistration_dragonRiderUserId_fkey" FOREIGN KEY ("dragonRiderUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentResult" ADD CONSTRAINT "TournamentResult_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "TournamentRegistration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

