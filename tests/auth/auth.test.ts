import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import { resetDatabase, prisma } from "../db";

let getCurrentUser: typeof import("@/lib/auth").getCurrentUser;
let requireUser: typeof import("@/lib/auth").requireUser;
let getAdminUser: typeof import("@/lib/auth").getAdminUser;

beforeAll(async () => {
  // Force mock mode for these tests; AUTH_MODE=supabase needs a real Supabase
  // server and is out of scope here.
  process.env.AUTH_MODE = "mock";
  ({ getCurrentUser, requireUser, getAdminUser } = await import("@/lib/auth"));
});

beforeEach(async () => {
  await resetDatabase();
});

describe("getCurrentUser (mock mode)", () => {
  it("auto-creates dev-user on first call", async () => {
    expect(await prisma.user.findFirst({ where: { username: "dev-user" } })).toBeNull();

    const user = await getCurrentUser();

    expect(user).not.toBeNull();
    expect(user?.username).toBe("dev-user");
    expect(user?.email).toBe("dev@stonetrade.local");

    const persisted = await prisma.user.findFirst({ where: { username: "dev-user" } });
    expect(persisted?.id).toBe(user?.id);
  });

  it("returns the same dev-user on repeat calls (no duplicate creation)", async () => {
    const first = await getCurrentUser();
    const second = await getCurrentUser();
    expect(second?.id).toBe(first?.id);

    const count = await prisma.user.count({ where: { username: "dev-user" } });
    expect(count).toBe(1);
  });
});

describe("requireUser", () => {
  it("returns the user when one is present", async () => {
    const user = await requireUser();
    expect(user.username).toBe("dev-user");
  });
});

describe("getAdminUser", () => {
  it("returns null when the current user has role USER (default)", async () => {
    await getCurrentUser(); // seed dev-user with default role
    const admin = await getAdminUser();
    expect(admin).toBeNull();
  });

  it("returns the user when role is ADMIN", async () => {
    const user = await getCurrentUser();
    await prisma.user.update({ where: { id: user!.id }, data: { role: "ADMIN" } });

    const admin = await getAdminUser();
    expect(admin).not.toBeNull();
    expect(admin?.id).toBe(user!.id);
    expect(admin?.role).toBe("ADMIN");
  });

  it("returns null when role is MODERATOR (only ADMIN passes)", async () => {
    const user = await getCurrentUser();
    await prisma.user.update({ where: { id: user!.id }, data: { role: "MODERATOR" } });

    const admin = await getAdminUser();
    expect(admin).toBeNull();
  });
});
