-- Adds gameplay stats and printed-card metadata fields sourced from the
-- wonders-2.0 card database. All columns are nullable so the migration
-- applies without a backfill pass; existing BOBA rows and legacy WoTF
-- rows without sync data remain valid.
--
-- Mirrors wonders-2.0 migrations:
--   0007-card-rules-fields.sql  → cost, power, keywords
--   0013-card-vision-fields.sql → class, faction, lineage, abilityName, coreMechanic

-- Gameplay stats (rule-engine fields)
ALTER TABLE "Card" ADD COLUMN IF NOT EXISTS "cost"     INTEGER;
ALTER TABLE "Card" ADD COLUMN IF NOT EXISTS "power"    INTEGER;
ALTER TABLE "Card" ADD COLUMN IF NOT EXISTS "keywords" TEXT;

-- Printed card metadata (vision-ingest fields)
ALTER TABLE "Card" ADD COLUMN IF NOT EXISTS "class"        TEXT;
ALTER TABLE "Card" ADD COLUMN IF NOT EXISTS "faction"      TEXT;
ALTER TABLE "Card" ADD COLUMN IF NOT EXISTS "lineage"      TEXT;
ALTER TABLE "Card" ADD COLUMN IF NOT EXISTS "abilityName"  TEXT;
ALTER TABLE "Card" ADD COLUMN IF NOT EXISTS "coreMechanic" TEXT;

-- Indexes for common filter queries
CREATE INDEX IF NOT EXISTS "Card_faction_idx" ON "Card" ("faction");
CREATE INDEX IF NOT EXISTS "Card_class_idx"   ON "Card" ("class");

-- Rebuild the full-text search vector to include the new fields.
-- Weight scheme:
--   A = name            (exact card name)
--   B = cardNumber, abilityName  (identifiers players search by)
--   C = rulesText, keywords      (gameplay content)
--   D = flavorText, faction, lineage, coreMechanic, class  (supplementary)
DROP INDEX IF EXISTS "Card_searchVector_idx";
ALTER TABLE "Card" ALTER COLUMN "searchVector" DROP EXPRESSION;
ALTER TABLE "Card" DROP COLUMN "searchVector";
ALTER TABLE "Card" ADD COLUMN "searchVector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("name", '')), 'A') ||
    setweight(to_tsvector('english',
      coalesce("cardNumber", '') || ' ' ||
      coalesce("abilityName", '')
    ), 'B') ||
    setweight(to_tsvector('english',
      coalesce("rulesText", '') || ' ' ||
      coalesce("keywords", '')
    ), 'C') ||
    setweight(to_tsvector('english',
      coalesce("flavorText", '') || ' ' ||
      coalesce("faction", '')    || ' ' ||
      coalesce("lineage", '')    || ' ' ||
      coalesce("coreMechanic", '') || ' ' ||
      coalesce("class", '')
    ), 'D')
  ) STORED;
CREATE INDEX "Card_searchVector_idx" ON "Card" USING GIN ("searchVector");
