-- Phase 3 follow-up: Hunting Trials side categories from PDF slide 16
-- (TOP_DRAGON, TOP_10, OSPREY).
--
-- NOTE: prisma migrate diff also emitted DropIndex + ALTER COLUMN against
-- the searchVector generated column. Both are spurious and removed below.
-- CreateEnum
CREATE TYPE "TrialKind" AS ENUM ('TOP_DRAGON', 'TOP_10', 'OSPREY');



-- CreateTable
CREATE TABLE "TrialAward" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "kind" "TrialKind" NOT NULL,
    "setCode" TEXT,
    "rank" INTEGER NOT NULL,
    "points" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrialAward_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrialAward_eventId_kind_idx" ON "TrialAward"("eventId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "TrialAward_eventId_kind_setCode_rank_key" ON "TrialAward"("eventId", "kind", "setCode", "rank");

-- AddForeignKey
ALTER TABLE "TrialAward" ADD CONSTRAINT "TrialAward_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "TournamentEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrialAward" ADD CONSTRAINT "TrialAward_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "TournamentRegistration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

