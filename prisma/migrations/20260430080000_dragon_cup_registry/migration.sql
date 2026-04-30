-- Public Stonefoil + OCM registry support.
--
-- Adds DragonScale.visibility for opt-in public display, plus a partial
-- unique index for OCMs paralleling the Stonefoil one shipped earlier.
-- OCM cards are serialised at per-rarity print runs (Mythic 10, ...,
-- Common 99); a specific serial number is one physical card, so at most
-- one DragonScale can claim (cardId, serialNumber) globally for OCM.
-- The constraint only fires when serialNumber is non-null — claims that
-- omit the serial don't conflict with each other (we still encourage
-- callers to supply it via the API validator).

CREATE TYPE "RegistryVisibility" AS ENUM ('PRIVATE', 'PUBLIC_NAMED', 'PUBLIC_ANONYMOUS');

ALTER TABLE "DragonScale"
  ADD COLUMN "visibility" "RegistryVisibility" NOT NULL DEFAULT 'PRIVATE';

CREATE UNIQUE INDEX "DragonScale_ocm_serial_unique"
  ON "DragonScale" ("cardId", "serialNumber")
  WHERE treatment = 'OCM' AND "serialNumber" IS NOT NULL;
