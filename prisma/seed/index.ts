import "dotenv/config";
import { PrismaClient } from "../../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { seedWotfExistence } from "./wotf-existence.js";
import { seedBjbaAlpha } from "./bjba-alpha.js";

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  console.log("Starting database seed...\n");

  try {
    await seedWotfExistence(prisma);
    console.log("");
    await seedBjbaAlpha(prisma);
    console.log("\nSeed complete.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});
