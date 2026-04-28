import { prisma } from "@/lib/prisma";

/**
 * Truncate every table in the test database. Cheap reset between tests.
 * Order is enforced by `CASCADE` so we don't have to track FK dependencies
 * by hand. Skips Prisma's internal migration log.
 */
export async function resetDatabase(): Promise<void> {
  if (!process.env.DATABASE_URL?.includes("test")) {
    throw new Error(
      `resetDatabase refused: DATABASE_URL does not look like a test database (${process.env.DATABASE_URL}). ` +
        "Set TEST_DATABASE_URL in your env so tests/setup.ts can swap it in.",
    );
  }

  const tables = (await prisma.$queryRawUnsafe<Array<{ tablename: string }>>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE '_prisma_%'`,
  )).map((r) => r.tablename);

  if (tables.length === 0) return;

  const list = tables.map((t) => `"${t}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

export { prisma };
