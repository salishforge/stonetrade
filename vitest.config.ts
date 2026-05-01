import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    // Test files share a single Postgres test database and call
    // resetDatabase() in beforeEach. Running them in parallel forks lets
    // concurrent seeds collide on unique constraints (e.g. Game.slug) and
    // truncate fixtures another file is mid-way through. fileParallelism:
    // false forces maxWorkers=1, eliminating the race.
    fileParallelism: false,
  },
});
