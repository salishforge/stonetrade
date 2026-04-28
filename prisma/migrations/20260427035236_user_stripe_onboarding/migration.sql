-- AlterTable: cache seller onboarding state for fast gating
ALTER TABLE "User" ADD COLUMN "stripeOnboardingComplete" BOOLEAN NOT NULL DEFAULT false;
