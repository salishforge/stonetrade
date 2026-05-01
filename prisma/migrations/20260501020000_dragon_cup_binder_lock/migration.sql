-- Tournament binder check-in / locking (PDF slides 9 + 13). Snapshots
-- contributing scales into TournamentBinderLock + LockedScale at
-- registration; releases when the event closes.
--
-- NOTE: prisma migrate diff also emitted DropIndex + ALTER COLUMN against
-- the searchVector generated column; both are spurious and removed below.


-- CreateTable
CREATE TABLE "TournamentBinderLock" (
    "id" TEXT NOT NULL,
    "tournamentRegistrationId" TEXT NOT NULL,
    "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),
    "declaredPointsAtLock" INTEGER NOT NULL,
    "totalPointsAtLock" INTEGER NOT NULL,

    CONSTRAINT "TournamentBinderLock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LockedScale" (
    "id" TEXT NOT NULL,
    "binderLockId" TEXT NOT NULL,
    "dragonScaleId" TEXT NOT NULL,
    "pointsAtLock" INTEGER NOT NULL,

    CONSTRAINT "LockedScale_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TournamentBinderLock_tournamentRegistrationId_key" ON "TournamentBinderLock"("tournamentRegistrationId");

-- CreateIndex
CREATE INDEX "TournamentBinderLock_releasedAt_idx" ON "TournamentBinderLock"("releasedAt");

-- CreateIndex
CREATE INDEX "LockedScale_dragonScaleId_idx" ON "LockedScale"("dragonScaleId");

-- CreateIndex
CREATE UNIQUE INDEX "LockedScale_binderLockId_dragonScaleId_key" ON "LockedScale"("binderLockId", "dragonScaleId");

-- AddForeignKey
ALTER TABLE "TournamentBinderLock" ADD CONSTRAINT "TournamentBinderLock_tournamentRegistrationId_fkey" FOREIGN KEY ("tournamentRegistrationId") REFERENCES "TournamentRegistration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LockedScale" ADD CONSTRAINT "LockedScale_binderLockId_fkey" FOREIGN KEY ("binderLockId") REFERENCES "TournamentBinderLock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LockedScale" ADD CONSTRAINT "LockedScale_dragonScaleId_fkey" FOREIGN KEY ("dragonScaleId") REFERENCES "DragonScale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

