-- Postgres-generated tsvector column. Weighted: name (A) > cardNumber (B) >
-- rulesText (C) > flavorText (D). The generated expression keeps the column
-- in sync without application-side maintenance.
ALTER TABLE "Card" ADD COLUMN "searchVector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("name", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("cardNumber", '')), 'B') ||
    setweight(to_tsvector('english', coalesce("rulesText", '')), 'C') ||
    setweight(to_tsvector('english', coalesce("flavorText", '')), 'D')
  ) STORED;

-- GIN index for fast full-text search.
CREATE INDEX "Card_searchVector_idx" ON "Card" USING GIN ("searchVector");
