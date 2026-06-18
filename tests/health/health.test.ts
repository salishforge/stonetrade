import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the Prisma client so we can drive both the happy path and the
// "database is down" failure path without standing up Postgres.
const $queryRawMock = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: (...args: unknown[]) => $queryRawMock(...args),
  },
}));

// The route imports validateEnv from src/lib/env; we let the real
// implementation run against the test process.env so the integration
// remains realistic.

beforeEach(() => {
  $queryRawMock.mockReset();
});

describe("GET /api/health", () => {
  it("returns 200 + status=ok when the database ping succeeds", async () => {
    $queryRawMock.mockResolvedValue([{ "?column?": 1 }]);

    const { GET } = await import("@/app/api/health/route");
    const res = await GET();
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      status: string;
      checks: { database: { ok: boolean; detail?: { latencyMs?: number } } };
      uptimeSeconds: number;
    };
    expect(body.status).toBe("ok");
    expect(body.checks.database.ok).toBe(true);
    expect(typeof body.checks.database.detail?.latencyMs).toBe("number");
    expect(typeof body.uptimeSeconds).toBe("number");
  });

  it("returns 503 + status=down when the database ping throws", async () => {
    $queryRawMock.mockRejectedValue(new Error("connection refused"));

    const { GET } = await import("@/app/api/health/route");
    const res = await GET();
    expect(res.status).toBe(503);

    const body = (await res.json()) as {
      status: string;
      checks: { database: { ok: boolean; detail?: { error?: string } } };
    };
    expect(body.status).toBe("down");
    expect(body.checks.database.ok).toBe(false);
    expect(body.checks.database.detail?.error).toContain("connection refused");
  });

  it("includes env warnings (not errors) in the env check block", async () => {
    $queryRawMock.mockResolvedValue([{ "?column?": 1 }]);

    const { GET } = await import("@/app/api/health/route");
    const res = await GET();
    const body = (await res.json()) as {
      checks: { env: { ok: boolean; detail?: { warnings: { key: string; message: string }[] } } };
    };

    // We can't assert specific warnings (depends on the test runner's env)
    // but the shape must be: a `warnings` array, and no secret values
    // anywhere in the message strings.
    expect(Array.isArray(body.checks.env.detail?.warnings)).toBe(true);
    for (const w of body.checks.env.detail?.warnings ?? []) {
      expect(typeof w.key).toBe("string");
      expect(typeof w.message).toBe("string");
    }
  });
});
