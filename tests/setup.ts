import "dotenv/config";

// Tests that need a database expect DATABASE_URL pointing to a dedicated test
// database — NOT the dev database, since tests truncate data. The CI workflow
// provisions this; locally, set TEST_DATABASE_URL in .env and the helper in
// tests/db.ts swaps it in.
if (process.env.TEST_DATABASE_URL && !process.env.DATABASE_URL_DEV) {
  process.env.DATABASE_URL_DEV = process.env.DATABASE_URL;
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
