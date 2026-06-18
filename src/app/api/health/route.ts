import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateEnv } from "@/lib/env";

/**
 * Liveness/readiness endpoint for load balancers, uptime checks, and the
 * Docker HEALTHCHECK directive.
 *
 * Contract:
 *   - 200 `ok` when the database is reachable.
 *   - 503 `down` when the database ping fails (the LB should pull this
 *     instance out of rotation).
 *   - Either status carries an `env` block summarising the validator's
 *     warnings — *not* errors, because env errors would have crashed the
 *     process at boot via instrumentation. The warnings tell ops which
 *     integrations are currently inert on this environment.
 *
 * No auth: this is meant for infra probes. Be careful what's exposed —
 * we surface env *categories* (e.g. "stripe: not configured") never the
 * actual values, and we never echo any secret.
 *
 * Force-dynamic because we ping the database on every call; caching this
 * defeats its purpose.
 */
export const dynamic = "force-dynamic";

interface HealthCheck<T = unknown> {
  ok: boolean;
  detail?: T;
}

interface HealthResponse {
  status: "ok" | "down";
  timestamp: string;
  uptimeSeconds: number;
  checks: {
    database: HealthCheck<{ latencyMs?: number; error?: string }>;
    env: HealthCheck<{ warnings: { key: string; message: string }[] }>;
  };
}

async function pingDatabase(): Promise<HealthCheck<{ latencyMs?: number; error?: string }>> {
  const started = Date.now();
  try {
    // Use $queryRaw (not $queryRawUnsafe) so the literal is parameterised
    // safely even though there's nothing to inject here. Cheapest possible
    // query — Postgres parses + responds in well under a millisecond.
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true, detail: { latencyMs: Date.now() - started } };
  } catch (err) {
    return {
      ok: false,
      detail: { error: err instanceof Error ? err.message : String(err) },
    };
  }
}

export async function GET(): Promise<NextResponse<HealthResponse>> {
  const database = await pingDatabase();

  // Re-run env validation on every request. It's pure and cheap (string
  // presence checks), and re-running means an operator can hit /api/health
  // after rotating an env var without restarting the server.
  const envResult = validateEnv(process.env);

  const status: HealthResponse["status"] = database.ok ? "ok" : "down";
  const body: HealthResponse = {
    status,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    checks: {
      database,
      env: {
        // env.ok reflects whether errors are present. In a healthy prod
        // boot they shouldn't be (assertEnv would have thrown), but we
        // report the check honestly either way.
        ok: envResult.ok,
        detail: {
          warnings: envResult.warnings.map((w) => ({ key: w.key, message: w.message })),
        },
      },
    },
  };

  return NextResponse.json(body, { status: status === "ok" ? 200 : 503 });
}
