import { describe, it, expect } from "vitest";
import { validateEnv } from "@/lib/env";

// Minimal valid env for production. Each test starts from this and mutates
// the one field under test, so failures are about that field, not about
// some unrelated baseline drift.
const prodBaseline = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://u:p@db:5432/x",
  NEXT_PUBLIC_APP_URL: "https://stonetrade.app",
  AUTH_MODE: "supabase",
  NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
};

describe("validateEnv — production posture", () => {
  it("accepts a fully configured production environment", () => {
    const result = validateEnv(prodBaseline);
    expect(result.ok).toBe(true);
    expect(result.isProduction).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects production without DATABASE_URL", () => {
    const env: Record<string, string | undefined> = { ...prodBaseline };
    delete env.DATABASE_URL;
    const result = validateEnv(env);
    expect(result.ok).toBe(false);
    expect(result.errors.find((e) => e.key === "DATABASE_URL")).toBeTruthy();
  });

  it("rejects production without NEXT_PUBLIC_APP_URL", () => {
    const env: Record<string, string | undefined> = { ...prodBaseline };
    delete env.NEXT_PUBLIC_APP_URL;
    const result = validateEnv(env);
    expect(result.ok).toBe(false);
    expect(result.errors.find((e) => e.key === "NEXT_PUBLIC_APP_URL")).toBeTruthy();
  });

  it("rejects production NEXT_PUBLIC_APP_URL that still points at localhost", () => {
    const result = validateEnv({ ...prodBaseline, NEXT_PUBLIC_APP_URL: "http://localhost:3000" });
    expect(result.ok).toBe(false);
    expect(result.errors.find((e) => e.key === "NEXT_PUBLIC_APP_URL" && /dev value/.test(e.message))).toBeTruthy();
  });

  it("rejects production NEXT_PUBLIC_APP_URL missing a scheme", () => {
    const result = validateEnv({ ...prodBaseline, NEXT_PUBLIC_APP_URL: "stonetrade.app" });
    expect(result.ok).toBe(false);
    expect(result.errors.find((e) => /http:\/\/ or https:\/\//.test(e.message))).toBeTruthy();
  });

  it("rejects production without AUTH_MODE explicitly set", () => {
    const env: Record<string, string | undefined> = { ...prodBaseline };
    delete env.AUTH_MODE;
    const result = validateEnv(env);
    expect(result.ok).toBe(false);
    expect(result.errors.find((e) => e.key === "AUTH_MODE")).toBeTruthy();
  });

  it("rejects AUTH_MODE values other than supabase/mock", () => {
    const result = validateEnv({ ...prodBaseline, AUTH_MODE: "oauth" });
    expect(result.ok).toBe(false);
    expect(result.errors.find((e) => e.key === "AUTH_MODE")).toBeTruthy();
  });

  it("rejects AUTH_MODE=supabase without Supabase keys", () => {
    const env = { ...prodBaseline } as Record<string, string | undefined>;
    delete env.NEXT_PUBLIC_SUPABASE_URL;
    delete env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete env.SUPABASE_SERVICE_ROLE_KEY;
    const result = validateEnv(env);
    expect(result.ok).toBe(false);
    expect(result.errors.filter((e) => e.key.startsWith("NEXT_PUBLIC_SUPABASE_") || e.key === "SUPABASE_SERVICE_ROLE_KEY")).toHaveLength(3);
  });

  it("accepts AUTH_MODE=mock in production (deliberate opt-in)", () => {
    const env = { ...prodBaseline, AUTH_MODE: "mock" } as Record<string, string | undefined>;
    delete env.NEXT_PUBLIC_SUPABASE_URL;
    delete env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete env.SUPABASE_SERVICE_ROLE_KEY;
    const result = validateEnv(env);
    expect(result.ok).toBe(true);
  });

  it("warns when Wonders platform URLs still point at localhost in production", () => {
    const result = validateEnv({
      ...prodBaseline,
      WONDERS_PLATFORM_API_URL: "http://localhost:8001",
    });
    expect(result.ok).toBe(true);
    expect(result.warnings.find((w) => w.key === "WONDERS_PLATFORM_API_URL")).toBeTruthy();
  });
});

describe("validateEnv — feature warnings", () => {
  it("warns for each feature group that is fully unconfigured", () => {
    const result = validateEnv(prodBaseline);
    const features = result.warnings.map((w) => w.key);
    // baseline has none of the integrations set
    expect(features).toContain("stripe");
    expect(features).toContain("resend (email)");
    expect(features).toContain("novu (notifications)");
  });

  it("emits a partial-configuration warning when only some keys in a group are set", () => {
    const result = validateEnv({
      ...prodBaseline,
      STRIPE_SECRET_KEY: "sk_test_xxx",
    });
    const stripe = result.warnings.find((w) => w.key === "stripe");
    expect(stripe?.message).toMatch(/partially configured/);
    expect(stripe?.message).toMatch(/STRIPE_WEBHOOK_SECRET/);
  });

  it("does not warn when every key in a feature group is set", () => {
    const result = validateEnv({
      ...prodBaseline,
      STRIPE_SECRET_KEY: "sk_live_xxx",
      STRIPE_WEBHOOK_SECRET: "whsec_xxx",
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live_xxx",
    });
    expect(result.warnings.find((w) => w.key === "stripe")).toBeFalsy();
  });
});

describe("validateEnv — dev posture", () => {
  it("does not require NEXT_PUBLIC_APP_URL in dev", () => {
    const result = validateEnv({
      NODE_ENV: "development",
      DATABASE_URL: "postgresql://x",
      AUTH_MODE: "mock",
    });
    // present-but-missing app URL is a warning in dev, not an error
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("treats absent AUTH_MODE as ok in dev (mock-mode fallback)", () => {
    const result = validateEnv({
      NODE_ENV: "development",
      DATABASE_URL: "postgresql://x",
    });
    expect(result.errors.find((e) => e.key === "AUTH_MODE")).toBeFalsy();
  });

  it("rejects an unknown AUTH_MODE value even in dev", () => {
    const result = validateEnv({
      NODE_ENV: "development",
      DATABASE_URL: "postgresql://x",
      AUTH_MODE: "passkey",
    });
    expect(result.errors.find((e) => e.key === "AUTH_MODE")).toBeTruthy();
  });
});

describe("validateEnv — invariants", () => {
  it("treats empty-string values as missing (matches .env.example placeholder semantics)", () => {
    const result = validateEnv({
      ...prodBaseline,
      DATABASE_URL: "",
    });
    expect(result.errors.find((e) => e.key === "DATABASE_URL")).toBeTruthy();
  });

  it("treats whitespace-only values as missing", () => {
    const result = validateEnv({
      ...prodBaseline,
      DATABASE_URL: "   ",
    });
    expect(result.errors.find((e) => e.key === "DATABASE_URL")).toBeTruthy();
  });
});
